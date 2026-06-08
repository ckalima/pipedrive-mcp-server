# Implementation Plan: Lead-to-Deal Conversion with Async Polling (Issue #13)

> Firewalled-pipeline plan artifact. The implement agent executes this VERBATIM.
> A separate verify agent runs `npm run build` + `npm test` afterward.

## Summary of key decisions

- **Tool name:** `pipedrive_convert_lead_to_deal`; **handler:** `convertLeadToDeal`.
- **Endpoints (v2):** `POST /leads/{id}/convert/deal` then poll `GET /leads/{id}/convert/status/{conversion_id}`.
- **POST body:** EMPTY (`{}`). The issue and Phase 3B reference describe a MINIMAL conversion (just the lead id in the path). No optional deal fields are accepted. Documented rationale: the v2 convert endpoint copies the lead's existing data into the new deal; adding overrides is out of scope for this issue and not required by the reference doc.
- **Sleep/polling mechanism (THE critical decision):** A module-level `const BACKOFF_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 16000]` (sum 31.5s ≈ the ~30s cap) plus an **injectable `sleep` parameter** on the handler that defaults to a real timer. Tests pass a no-op `sleep` (resolves immediately), so NO real wall-clock delay occurs. This avoids vitest fake timers, which would fight the existing harness (the leads tests use async dynamic `import()` and the client uses `AbortSignal.timeout`; fake timers do not interact cleanly with either). The existing `createMockFetch` already serves an ARRAY of responses sequentially (POST first, then each GET), which is exactly what the polling tests need.
- **Timeout path:** After the POST, poll up to `BACKOFF_DELAYS_MS.length` times (sleep BEFORE each poll). If the conversion is still pending/running after the last scheduled delay is exhausted, return a NON-error text payload containing `conversion_id` + the last observed `status` for manual follow-up.
- **Failure path:** status `failed` (or `rejected`) returns `mcpErrorResult(...)` (an error result via `mcpErrorFromCode`).
- **Client-error path:** any `success:false` from the POST or any status GET returns `mcpErrorResult(response)`.
- **index.ts is NOT touched:** `src/tools/index.ts` spreads `...leadsTools` (line 27). Appending the new entry to the `leadsTools` array in `leads.ts` automatically registers the tool. Confirmed by reading `src/tools/index.ts`.

## Scope — files changed

1. `src/schemas/leads.ts` — add `ConvertLeadToDealSchema` + its type export. ADDITIVE only.
2. `src/tools/leads.ts` — add imports, the `convertLeadToDeal` handler + `BACKOFF_DELAYS_MS` const + `sleep` helper, and append one entry to `leadsTools`. ADDITIVE only (no existing handlers modified).
3. `tests/unit/schemas/leads.test.ts` — add a `describe('ConvertLeadToDealSchema', ...)` block. ADDITIVE.
4. `tests/integration/tools/leads.test.ts` — add a `describe('convertLeadToDeal', ...)` block + extend the registration smoke check. ADDITIVE.

Do NOT modify `src/tools/index.ts`, the client, or any other entity files.

---

## 1. `src/schemas/leads.ts`

Add the schema immediately AFTER the `DeleteLeadSchema` definition (after line 102, before the `SearchLeadsSchema` block) — placement is cosmetic, but put it there to keep id-based schemas grouped. The id validation mirrors `LeadIdSchema` (UUID string).

Insert this block:

```ts
/**
 * Convert lead to deal parameters - lead UUID only.
 * The v2 convert endpoint copies the lead's existing data into the new deal;
 * no optional deal-field overrides are accepted (minimal conversion).
 */
export const ConvertLeadToDealSchema = LeadIdSchema;
```

Add the type export to the "Type exports" block at the bottom of the file (after `export type DeleteLeadParams = ...;`):

```ts
export type ConvertLeadToDealParams = z.infer<typeof ConvertLeadToDealSchema>;
```

No other changes to this file. `LeadIdSchema` already exists (line 25) and validates `{ id: z.string().uuid() }`.

---

## 2. `src/tools/leads.ts`

### 2a. Imports

Extend the existing schema import block (lines 6-21) to add `ConvertLeadToDealSchema` and `ConvertLeadToDealParams`. The final import block must read:

```ts
import {
  ListLeadsSchema,
  ListArchivedLeadsSchema,
  GetLeadSchema,
  CreateLeadSchema,
  UpdateLeadSchema,
  DeleteLeadSchema,
  SearchLeadsSchema,
  ConvertLeadToDealSchema,
  type ListLeadsParams,
  type ListArchivedLeadsParams,
  type GetLeadParams,
  type CreateLeadParams,
  type UpdateLeadParams,
  type DeleteLeadParams,
  type SearchLeadsParams,
  type ConvertLeadToDealParams,
} from "../schemas/leads.js";
```

Extend the errors import (line 23) to add `mcpErrorFromCode`. The final line must read:

```ts
import { mcpErrorResult, mcpErrorFromCode, destructiveOperationGuard } from "../utils/errors.js";
```

(`mcpErrorFromCode` already exists in `src/utils/errors.ts`, signature `(code: ErrorCode, message: string, suggestion?: string) => McpToolErrorResult`. We use code `"API_ERROR"` for a failed conversion.)

### 2b. Polling constants + sleep helper

Add the following AFTER the import block and BEFORE the first handler (i.e., insert between line 24 `import { createListSummary } ...` and line 26 `/** List active ... */`):

```ts
/**
 * Exponential backoff schedule for polling the async lead-to-deal conversion.
 * One sleep is performed BEFORE each status poll. The sum (~31.5s) enforces the
 * ~30 second cap from issue #13: once these delays are exhausted we stop polling.
 */
export const BACKOFF_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 16000];

/** Sleep helper, injectable so tests can supply a no-op (zero real delay). */
export type SleepFn = (ms: number) => Promise<void>;
const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
```

### 2c. Handler

Add the `convertLeadToDeal` handler AFTER `searchLeads` (after line 246, the closing `}` of `searchLeads`) and BEFORE the `/** Tool definitions for MCP registration */` comment (line 248). Insert exactly:

```ts
/**
 * Convert a lead to a deal (v2). The conversion is asynchronous:
 *  1. POST /leads/{id}/convert/deal returns a { conversion_id }
 *  2. Poll GET /leads/{id}/convert/status/{conversion_id} with exponential
 *     backoff until status is "completed" or "failed".
 * On success returns the created deal id. On failure returns an error result.
 * If still running after the ~30s backoff cap is exhausted, returns the
 * conversion_id + last status (non-error) so the caller can check later.
 *
 * The `sleep` parameter is injectable purely for testing (defaults to a real timer).
 */
export async function convertLeadToDeal(
  params: ConvertLeadToDealParams,
  sleep: SleepFn = realSleep,
) {
  const client = getClient();

  // 1. Kick off the async conversion.
  const startResponse = await client.post<{ conversion_id?: string }>(
    `/leads/${params.id}/convert/deal`,
    {},
    "v2",
  );

  if (!startResponse.success || !startResponse.data) {
    return mcpErrorResult(startResponse);
  }

  const conversionId = startResponse.data.conversion_id;
  if (!conversionId) {
    return mcpErrorFromCode(
      "API_ERROR",
      "Conversion did not return a conversion_id",
      "Retry the conversion or check the lead in Pipedrive",
    );
  }

  // 2. Poll for completion with exponential backoff.
  let lastStatus = "not_started";
  let lastData: Record<string, unknown> | undefined;

  for (const delay of BACKOFF_DELAYS_MS) {
    await sleep(delay);

    const statusResponse = await client.get<Record<string, unknown>>(
      `/leads/${params.id}/convert/status/${conversionId}`,
      undefined,
      "v2",
    );

    if (!statusResponse.success || !statusResponse.data) {
      return mcpErrorResult(statusResponse);
    }

    lastData = statusResponse.data;
    lastStatus = String(statusResponse.data.status ?? lastStatus);

    if (lastStatus === "completed") {
      const dealId = lastData.deal_id;
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            summary: `Lead ${params.id} converted to deal ${dealId}`,
            data: {
              lead_id: params.id,
              deal_id: dealId,
              conversion_id: conversionId,
              status: lastStatus,
            },
          }, null, 2),
        }],
      };
    }

    if (lastStatus === "failed" || lastStatus === "rejected") {
      return mcpErrorFromCode(
        "API_ERROR",
        `Lead conversion ${conversionId} ${lastStatus}`,
        "Check the lead's data in Pipedrive and retry the conversion",
      );
    }
    // Otherwise status is pending/running/not_started: loop and back off again.
  }

  // 3. Timeout: still running after the backoff cap was exhausted.
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Lead ${params.id} conversion still in progress after timeout`,
        data: {
          lead_id: params.id,
          conversion_id: conversionId,
          status: lastStatus,
          note: "Conversion did not complete within the polling window. Use the conversion_id to check status later.",
        },
      }, null, 2),
    }],
  };
}
```

Notes for the implementer:
- The handler signature has a SECOND parameter `sleep` with a default. The MCP runtime calls handlers with a single args object, so the default `realSleep` is always used in production. Tests call `convertLeadToDeal(params, noopSleep)` directly. This does not affect tool registration (the registry only stores `handler`, never inspects arity).
- Statuses treated as terminal-success: `"completed"`. Terminal-failure: `"failed"`, `"rejected"`. Everything else (`"not_started"`, `"pending"`, `"running"`, etc.) is treated as still-running and loops.

### 2d. `leadsTools` array entry

Append this entry to the `leadsTools` array. Place it as the LAST element, after the `pipedrive_delete_lead` entry (after line 388's closing `},` and before the array's closing `];` on line 389):

```ts
  {
    name: "pipedrive_convert_lead_to_deal",
    description: "Convert a lead into a deal (Pipedrive v2). The conversion runs asynchronously; this tool polls until it completes (typically under 5s) and returns the new deal ID. If it is still running after ~30s, it returns the conversion_id and status for manual follow-up.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Lead UUID to convert" },
      },
      required: ["id"],
    },
    handler: convertLeadToDeal,
    schema: ConvertLeadToDealSchema,
  },
```

---

## 3. `src/tools/index.ts` — NOT TOUCHED

Confirmed: `src/tools/index.ts` line 27 spreads `...leadsTools` into `allTools`. Adding the entry to `leadsTools` in `leads.ts` is sufficient for registration via `getToolHandler` / `getToolSchema` / `toolDefinitions`. Do not edit `index.ts`.

---

## TEST IMPACT (mandatory)

This change is purely ADDITIVE. No existing test is modified or removed, so no existing test can break. The new tests rely on the EXISTING `createMockFetch` array behavior (`tests/helpers/mockFetch.ts` lines 51-68): `mockFetch([...])` serves responses in order — the first call (POST) gets entry 0, the next call (status GET) gets entry 1, etc., clamping to the last entry. The `sleep` injection means tests pass instantly.

`mockApiSuccess(data)` produces a single-response mock; `mockFetch([{status,data}, ...])` produces a sequential mock. The status payload's `data` is the object the handler reads (`{ status, deal_id }`), because the client returns `responseData.data` as `data`.

A no-op sleep is defined inline in the test file: `const noSleep = async () => {};`.

### 3a. `tests/unit/schemas/leads.test.ts`

Add `ConvertLeadToDealSchema` to the import list at the top (line 6-16 block). Then add this `describe` block inside the top-level `describe('leads schemas', ...)`, after the `DeleteLeadSchema` block (after its closing `});` near line 316):

```ts
  describe('ConvertLeadToDealSchema', () => {
    it('should accept valid UUID', () => {
      const result = ConvertLeadToDealSchema.parse({ id: VALID_UUID });
      expect(result.id).toBe(VALID_UUID);
    });

    it('should require id', () => {
      expect(() => ConvertLeadToDealSchema.parse({})).toThrow();
    });

    it('should reject integer id', () => {
      expect(() => ConvertLeadToDealSchema.parse({ id: 1 })).toThrow();
    });

    it('should reject non-UUID string', () => {
      expect(() => ConvertLeadToDealSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });
  });
```

### 3b. `tests/integration/tools/leads.test.ts`

Add `mockFetch` is already imported (line 7-13 block already imports `mockFetch`, `mockApiSuccess`, `mockApiError`, `fixtures`, `paginationFixtures`). No new imports needed.

Add this `describe` block AFTER the `searchLeads` describe block (after its closing `});` near line 403) and BEFORE the `tool registration smoke check` describe (line 405):

```ts
  describe('convertLeadToDeal', () => {
    const noSleep = async () => {};

    it('should return the created deal id on completed (first status poll)', async () => {
      // POST -> conversion_id, then first status GET -> completed with deal id
      mockFetch([
        { status: 200, data: { conversion_id: 'conv-123' } },
        { status: 200, data: { status: 'completed', deal_id: 999 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.deal_id).toBe(999);
      expect(parsed.data.conversion_id).toBe('conv-123');
      expect(parsed.data.status).toBe('completed');
      expect(parsed.summary).toContain('999');
    });

    it('should POST to the v2 convert endpoint with an empty body', async () => {
      const mockFn = mockFetch([
        { status: 200, data: { conversion_id: 'conv-1' } },
        { status: 200, data: { status: 'completed', deal_id: 1 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      const [postUrl, postOptions] = mockFn.mock.calls[0];
      expect(String(postUrl)).toContain(`/leads/${VALID_UUID}/convert/deal`);
      expect(String(postUrl)).toContain('/api/v2/');
      expect(postOptions.method).toBe('POST');
      expect(JSON.parse(postOptions.body)).toEqual({});
    });

    it('should poll the v2 status endpoint with the conversion id', async () => {
      const mockFn = mockFetch([
        { status: 200, data: { conversion_id: 'conv-xyz' } },
        { status: 200, data: { status: 'completed', deal_id: 7 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      const [statusUrl, statusOptions] = mockFn.mock.calls[1];
      expect(String(statusUrl)).toContain(
        `/leads/${VALID_UUID}/convert/status/conv-xyz`,
      );
      expect(statusOptions.method).toBe('GET');
    });

    it('should keep polling through pending/running until completed', async () => {
      // POST, then not_started -> running -> completed
      mockFetch([
        { status: 200, data: { conversion_id: 'conv-2' } },
        { status: 200, data: { status: 'not_started' } },
        { status: 200, data: { status: 'running' } },
        { status: 200, data: { status: 'completed', deal_id: 55 } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.deal_id).toBe(55);
    });

    it('should return an error result when status is failed', async () => {
      mockFetch([
        { status: 200, data: { conversion_id: 'conv-3' } },
        { status: 200, data: { status: 'failed' } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('failed');
    });

    it('should return conversion_id + status (non-error) on timeout', async () => {
      // POST returns conversion_id; every status poll stays "running".
      // The mock clamps to the last array entry, so all polls see "running".
      mockFetch([
        { status: 200, data: { conversion_id: 'conv-timeout' } },
        { status: 200, data: { status: 'running' } },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      // No real wait occurred (noSleep), and no error is returned.
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.conversion_id).toBe('conv-timeout');
      expect(parsed.data.status).toBe('running');
      expect(parsed.summary).toContain('still in progress');
    });

    it('should return an error result if the POST fails', async () => {
      mockApiError(400, 'Cannot convert');
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBe(true);
    });

    it('should return an error result if a status poll fails', async () => {
      mockFetch([
        { status: 200, data: { conversion_id: 'conv-4' } },
        { status: 500, ok: false, error: 'boom' },
      ]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBe(true);
    });

    it('should error when POST returns no conversion_id', async () => {
      mockFetch([{ status: 200, data: {} }]);
      const { convertLeadToDeal } = await getLeadsTools();

      const result = await convertLeadToDeal({ id: VALID_UUID }, noSleep);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('conversion_id');
    });
  });
```

### 3c. Extend the registration smoke check

In the existing `tool registration smoke check` describe (lines 405-421), add the new tool name to the `leadToolNames` array and update the count in the test title. Change:

```ts
    it('should have all 7 leads tools registered in allTools', async () => {
```
to:
```ts
    it('should have all 8 leads tools registered in allTools', async () => {
```

and add `'pipedrive_convert_lead_to_deal',` to the `leadToolNames` array (e.g. after `'pipedrive_delete_lead',`).

---

## Verification note

A separate verify agent runs `npm run build` (tsc, must pass clean) and `npm test` (vitest, all tests including the new ones must pass). Because every new test injects `noSleep`, the suite incurs ZERO real backoff delay and stays well within the 10s `testTimeout`. No production-path timing changes; `realSleep` is only used when the handler is called without the second argument (i.e., via the MCP runtime).
