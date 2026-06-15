/**
 * v1 version-routing seam and sunset safety.
 *
 * This module owns the API-version decision for the four v1-only capabilities
 * that have no v2 equivalent (notes, mail, users list/get/me, leads CRUD). The
 * handlers call a capability-scoped seam in place of the per-call-site `"v1"`
 * literal, so the version decision lives in one place (R1) and the client stays a
 * pure transport (KTD1). v2 call sites are untouched (R2).
 *
 * Resolution is by capability, not by path: the call site names its capability
 * explicitly, so a v2 path can never be misrouted even when its prefix collides
 * with a v1-only one (mail's `/persons/{id}/mailMessages` vs the v2 `/persons`
 * tree; leads CRUD's `/leads/{uuid}` vs the v2 `/leads/search`) (KTD2). The
 * endpoint string is still passed, but it is only consulted for the per-capability
 * collection-root check inside the retirement discriminator.
 *
 * Retirement is detected lazily from the call result, with no startup probe (R4):
 * a 410 Gone (the strong signal) or a per-capability collection-root 404 (a
 * conservative secondary) marks the capability retired for the process lifetime,
 * so later calls short-circuit without another upstream request. Every other
 * outcome — item not-found, validation, auth, rate-limit, 5xx, network/timeout —
 * is passed through unchanged (R5).
 */

import { getClient, type ApiResponse } from "./client.js";
import { capabilityRetiredError, redactSecrets } from "./utils/errors.js";

/** The four v1-only capabilities with no v2 migration target. */
export type CapabilityKey = "notes" | "mail" | "users" | "leads";

interface CapabilityConfig {
  /**
   * Stable, server-authored display name. This is the ONLY value interpolated into
   * the model-facing retirement message and the operator warning — never a
   * caller-supplied endpoint or any CRM-/backend-sourced value.
   */
  displayName: string;
  /** Every capability here rides v1 with no v2 equivalent (the at-risk marker, R1). */
  atRisk: true;
  /**
   * The v1-only endpoints this capability owns. Documentation/traceability for R1;
   * patterns ({id}/{uuid}) are written as in `docs/v1-only-capabilities.md`. The
   * runtime-significant subset is `collectionRoots` below.
   */
  endpoints: readonly string[];
  /**
   * Endpoints whose 404 is treated as a retirement signal (R5) — collection roots
   * that should always exist while v1 is live. Matched by exact string against the
   * endpoint the handler passes. EMPTY means 410-only: mail relies on 410 alone
   * because `/mailbox/mailThreads` legitimately 404s on inaccessible threads.
   */
  collectionRoots: ReadonlySet<string>;
}

/**
 * The registry. Keyed on capability; each call site opts only its v1 operations in
 * (R3 — leads routes CRUD here while search/convert stay on the client at v2).
 */
const CAPABILITIES: Record<CapabilityKey, CapabilityConfig> = {
  notes: {
    displayName: "Notes",
    atRisk: true,
    endpoints: ["/notes", "/notes/{id}"],
    collectionRoots: new Set(["/notes"]),
  },
  mail: {
    displayName: "Mail",
    atRisk: true,
    endpoints: [
      "/persons/{id}/mailMessages",
      "/deals/{id}/mailMessages",
      "/mailbox/mailThreads",
      "/mailbox/mailThreads/{id}",
      "/mailbox/mailMessages/{id}",
    ],
    // 410-only: the thread list 404s on inaccessible threads, so a 404 here is not
    // a retirement signal.
    collectionRoots: new Set(),
  },
  users: {
    displayName: "Users (list/get/me)",
    atRisk: true,
    endpoints: ["/users", "/users/me", "/users/{id}"],
    collectionRoots: new Set(["/users", "/users/me"]),
  },
  leads: {
    displayName: "Leads (CRUD)",
    atRisk: true,
    // CRUD only — never `/leads/search` or `/leads/{id}/convert/*`, which stay on v2.
    endpoints: ["/leads", "/leads/{uuid}"],
    collectionRoots: new Set(["/leads"]),
  },
};

/**
 * The R5 retirement discriminator. Given the seam-internal HTTP status (U1) and the
 * called endpoint, returns true only for a signal that the surface itself is gone:
 * a 410 on any registered operation, or a 404 on a 404-eligible collection root for
 * the capability. Everything else — including a body-less 5xx (status present) and
 * any mail 404 — is not retirement. A missing status (network/timeout) is never
 * retirement, which is what keeps transient failures from looking like a sunset.
 */
export function isRetirementSignal(
  capability: CapabilityKey,
  endpoint: string,
  httpStatus: number | undefined,
): boolean {
  if (httpStatus === 410) return true;
  if (httpStatus === 404 && CAPABILITIES[capability].collectionRoots.has(endpoint)) {
    return true;
  }
  return false;
}

// ─── Session state (module-level, process lifetime) ──────────────────────────────
// Valid because the STDIO server is one process per session (KTD6). An exported
// reset mirrors the getClient() singleton-state concern and keeps tests isolated.

const retired = new Set<CapabilityKey>();
const warned = new Set<CapabilityKey>();

/** Clears the per-session retired and warned state. For test isolation. */
export function resetVersionRoutingState(): void {
  retired.clear();
  warned.clear();
}

/**
 * Emits the once-per-session operator warning (R7) to stderr — never stdout, which
 * would corrupt the STDIO protocol. Only the server-authored display name is logged;
 * the whole line is routed through redactSecrets for consistency with client.ts,
 * even though no runtime value is in scope here (the warning fires before the
 * request is sent).
 */
function warnOnce(capability: CapabilityKey): void {
  if (warned.has(capability)) return;
  warned.add(capability);

  const { displayName } = CAPABILITIES[capability];
  console.error(
    redactSecrets(
      `[pipedrive-mcp] ${displayName} rides Pipedrive API v1, which has no v2 equivalent and is slated for retirement. Monitor https://developers.pipedrive.com/changelog`,
    ),
  );
}

/** The clear "retired, no v2 equivalent" envelope (R6), shaped like any failed call. */
function retirementResponse<T>(capability: CapabilityKey): ApiResponse<T> {
  return {
    success: false,
    error: capabilityRetiredError(CAPABILITIES[capability].displayName),
  };
}

/**
 * Core seam logic shared by every verb. Short-circuits a known-retired capability
 * (R4), warns once before the first request (R7), runs the underlying client call,
 * and swaps in the retirement envelope on a retirement signal (R5/R6) — otherwise
 * returns the client's ApiResponse untouched.
 */
async function send<T>(
  capability: CapabilityKey,
  endpoint: string,
  call: (client: ReturnType<typeof getClient>) => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  if (retired.has(capability)) {
    return retirementResponse<T>(capability);
  }

  warnOnce(capability);

  const response = await call(getClient());

  if (!response.success && isRetirementSignal(capability, endpoint, response.httpStatus)) {
    retired.add(capability);
    return retirementResponse<T>(capability);
  }

  return response;
}

/**
 * A capability-scoped seam mirroring the client's verbs, minus the version argument.
 * The handler calls this in place of the `"v1"` literal.
 */
export interface CapabilitySeam {
  get<T>(endpoint: string, params: URLSearchParams | undefined): Promise<ApiResponse<T>>;
  post<T>(endpoint: string, body: Record<string, unknown> | unknown[]): Promise<ApiResponse<T>>;
  put<T>(endpoint: string, body: Record<string, unknown>): Promise<ApiResponse<T>>;
  patch<T>(endpoint: string, body: Record<string, unknown> | unknown[]): Promise<ApiResponse<T>>;
  delete<T>(endpoint: string, body?: Record<string, unknown> | unknown[]): Promise<ApiResponse<T>>;
}

/** Builds a seam bound to one capability. */
export function createSeam(capability: CapabilityKey): CapabilitySeam {
  return {
    get<T>(endpoint: string, params: URLSearchParams | undefined) {
      return send<T>(capability, endpoint, (client) => client.get<T>(endpoint, params, "v1"));
    },
    post<T>(endpoint: string, body: Record<string, unknown> | unknown[]) {
      return send<T>(capability, endpoint, (client) => client.post<T>(endpoint, body, "v1"));
    },
    put<T>(endpoint: string, body: Record<string, unknown>) {
      return send<T>(capability, endpoint, (client) => client.put<T>(endpoint, body, "v1"));
    },
    patch<T>(endpoint: string, body: Record<string, unknown> | unknown[]) {
      return send<T>(capability, endpoint, (client) => client.patch<T>(endpoint, body, "v1"));
    },
    delete<T>(endpoint: string, body?: Record<string, unknown> | unknown[]) {
      // The client places the version BEFORE the optional body for DELETE, unlike
      // the other verbs where "v1" is the final argument.
      return send<T>(capability, endpoint, (client) => client.delete<T>(endpoint, "v1", body));
    },
  };
}

/** Pre-built per-capability seams the handlers import. */
export const notesV1 = createSeam("notes");
export const mailV1 = createSeam("mail");
export const usersV1 = createSeam("users");
export const leadsV1 = createSeam("leads");
