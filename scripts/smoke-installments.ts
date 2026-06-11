#!/usr/bin/env tsx
/**
 * Live smoke test for the deal-installments tools (issue #76).
 *
 * Installments are a Growth-plan-and-above Pipedrive feature, so CI can only
 * exercise these four tools against mocked fetch. This script drives the REAL
 * production code path (`handleCallTool` -> Zod validation -> handler -> client)
 * against a live Growth+ sandbox so the wire behaviour (auth scope, body shape,
 * comma-joined query param, error envelope) is confirmed at least once.
 *
 * It is intentionally NOT a vitest test and lives outside `src/`, so it is never
 * compiled by `tsc`, linted by `eslint src/`, or collected by vitest.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 *
 *   # Full round-trip (needs a Growth+ token + destructive writes enabled):
 *   PIPEDRIVE_API_KEY=<growth-plus-sandbox-token> \
 *   PIPEDRIVE_ENABLE_DESTRUCTIVE=true \
 *     npm run smoke:installments
 *
 *   # Not-entitled error-path check (use a NON-Growth token, e.g. a free/Essential
 *   # sandbox or trial token). Read-only, no writes, no destructive flag needed:
 *   PIPEDRIVE_API_KEY=<non-growth-token> \
 *     npm run smoke:installments -- --mode=not-entitled
 *
 * FLAGS
 *   --mode=full | not-entitled   (default: full)
 *   --keep                       skip teardown (leave the throwaway deals/product)
 *   --help
 *
 * EXIT CODE: 0 = all critical checks passed, 1 = a check failed or setup errored.
 * ---------------------------------------------------------------------------
 */
import { handleCallTool } from "../src/index.js";

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

// ── tiny harness helpers ────────────────────────────────────────────────────

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await handleCallTool({ params: { name, arguments: args } })) as ToolResult;
}

function bodyText(r: ToolResult): string {
  return r?.content?.[0]?.text ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBody(r: ToolResult): any {
  try {
    return JSON.parse(bodyText(r));
  } catch {
    return null;
  }
}

function idOf(r: ToolResult): number | undefined {
  const p = parseBody(r);
  return p?.data?.id ?? p?.data?.data?.id;
}

/** Collect the `id`s of installment objects in a list response's `data` array. */
function installmentIds(r: ToolResult): number[] {
  const p = parseBody(r);
  const data = Array.isArray(p?.data) ? p.data : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((it: any) => it?.id).filter((v: unknown): v is number => typeof v === "number");
}

type Check = { name: string; status: "PASS" | "FAIL" | "WARN" | "BLOCKED" | "SKIP"; detail: string };
const checks: Check[] = [];
function record(name: string, ok: boolean, detail: string): boolean {
  checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}  ${name}\n         ${detail}`);
  return ok;
}
function warn(name: string, detail: string): void {
  checks.push({ name, status: "WARN", detail });
  console.log(`  ⚠️  WARN  ${name}\n         ${detail}`);
}
/** The tool reached the API but the account's plan/permissions forbid the feature. Not a code bug. */
function block(name: string, detail: string): void {
  checks.push({ name, status: "BLOCKED", detail });
  console.log(`  🔒 BLOCKED  ${name}\n         ${detail}`);
}
/** A dependent step we could not run because a prerequisite did not produce its input. */
function skip(name: string, detail: string): void {
  checks.push({ name, status: "SKIP", detail });
  console.log(`  ⏭️  SKIP  ${name}\n         ${detail}`);
}

function shortErr(r: ToolResult): string {
  return bodyText(r).replace(/\s+/g, " ").slice(0, 240);
}

/** A clean not-entitled error (wrong plan / lacking permission), not a crash or a real bug. */
function isNotEntitled(r: ToolResult): boolean {
  const t = bodyText(r);
  return r.isError === true && (t.includes("PERMISSION_DENIED") || /subscription plan/i.test(t));
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function parseArgs(argv: string[]): { mode: string; keep: boolean; help: boolean; confirmSandbox: boolean } {
  let mode = "full";
  let keep = false;
  let help = false;
  let confirmSandbox = process.env.SMOKE_CONFIRM_SANDBOX === "true";
  for (const a of argv) {
    if (a.startsWith("--mode=")) mode = a.slice("--mode=".length);
    else if (a === "--keep") keep = true;
    else if (a === "--confirm-sandbox") confirmSandbox = true;
    else if (a === "--help" || a === "-h") help = true;
  }
  return { mode, keep, help, confirmSandbox };
}

/** Last-4 fingerprint so the user can confirm WHICH token is in play without leaking it. */
function tokenTail(): string {
  const t = process.env.PIPEDRIVE_API_KEY ?? "";
  return t.length >= 4 ? `…${t.slice(-4)} (len ${t.length})` : "(unset)";
}

const HELP = `
smoke-installments - live smoke of the deal-installments tools (issue #76)

  PIPEDRIVE_API_KEY=<sandbox> PIPEDRIVE_ENABLE_DESTRUCTIVE=true \\
    npm run smoke:installments -- --confirm-sandbox        # full round-trip
  PIPEDRIVE_API_KEY=<non-growth> \\
    npm run smoke:installments -- --mode=not-entitled      # non-Growth error path
  npm run smoke:installments -- --confirm-sandbox --keep   # skip teardown

Flags:
  --mode=full|not-entitled   default: full
  --confirm-sandbox          REQUIRED for full mode; affirms the token is a throwaway
                             sandbox (full mode CREATES and DELETES real deals/products).
  --keep                     leave the throwaway deals/product behind
  --help

Env:
  PIPEDRIVE_API_KEY              Growth+ sandbox token (full) or non-Growth token (not-entitled).
                                 NOTE: src loads dotenv, so a repo .env is the FALLBACK. An explicit
                                 shell var (PIPEDRIVE_API_KEY=… npm run …) overrides .env and is safest.
  PIPEDRIVE_ENABLE_DESTRUCTIVE  must be "true" for the full round-trip (delete + teardown).
  SMOKE_CONFIRM_SANDBOX         "true" is equivalent to passing --confirm-sandbox.
`;

// ── modes ───────────────────────────────────────────────────────────────────

async function runNotEntitled(): Promise<boolean> {
  console.log("\n── Mode: not-entitled (expecting a clean mapped error, not a crash) ──\n");
  console.log("Calling pipedrive_list_deal_installments with a non-Growth token...\n");

  let res: ToolResult;
  try {
    res = await call("pipedrive_list_deal_installments", { deal_ids: [1] });
  } catch (err) {
    record(
      "not-entitled returns a mapped error (no crash)",
      false,
      `Handler THREW instead of returning an error envelope: ${String(err)}`,
    );
    return false;
  }

  const isCleanError = res.isError === true && bodyText(res).length > 0;
  const ok = record(
    "not-entitled returns a mapped error (no crash)",
    isCleanError,
    isCleanError
      ? `isError=true, structured envelope returned (no exception).`
      : `Expected isError=true with a message; got isError=${res.isError}, text="${shortErr(res)}".`,
  );
  console.log("\n  Mapped error envelope (paste this into #76):");
  console.log("  " + bodyText(res).split("\n").join("\n  "));
  return ok;
}

async function runFull(keep: boolean): Promise<boolean> {
  const stamp = Date.now();
  const billingDate = futureDate(90);
  let dealA: number | undefined;
  let dealB: number | undefined;
  let productId: number | undefined;
  let instA: number | undefined;
  let instB: number | undefined;
  let allOk = true;
  let notEntitled = false;

  console.log("\n── Mode: full round-trip ──");
  console.log(`   stamp=${stamp}  billing_date=${billingDate}\n`);

  try {
    // ── Setup ────────────────────────────────────────────────────────────────
    console.log("Setup: creating a product + two deals (each needs >=1 one-time product, no recurring)...\n");

    const prodRes = await call("pipedrive_create_product", { name: `Smoke #76 product ${stamp}` });
    productId = idOf(prodRes);
    if (!record("setup: create one-time product", !prodRes.isError && !!productId, productId ? `product_id=${productId}` : shortErr(prodRes))) {
      return false; // can't proceed without a product
    }

    for (const which of ["A", "B"] as const) {
      const dealRes = await call("pipedrive_create_deal", { title: `Smoke #76 deal ${which} ${stamp}`, value: 1000 });
      const dealId = idOf(dealRes);
      const okDeal = record(`setup: create deal ${which}`, !dealRes.isError && !!dealId, dealId ? `deal_id=${dealId}` : shortErr(dealRes));
      if (!okDeal || !dealId) return false;
      if (which === "A") dealA = dealId;
      else dealB = dealId;

      const linkRes = await call("pipedrive_add_deal_product", {
        id: dealId,
        product_id: productId,
        item_price: 1000,
        quantity: 1,
      });
      if (!record(`setup: attach one-time product to deal ${which}`, !linkRes.isError, linkRes.isError ? shortErr(linkRes) : "attached")) {
        return false;
      }
    }

    // ── Acceptance 2 (part 1): ADD on each deal ───────────────────────────────
    console.log("\nAcceptance: add_deal_installment round-trip...\n");

    const addA = await call("pipedrive_add_deal_installment", { id: dealA, description: `Smoke A ${stamp}`, amount: 250, billing_date: billingDate });
    if (isNotEntitled(addA)) {
      notEntitled = true;
      block("add_deal_installment (deal A)", `account is NOT installments-entitled (needs Growth+). The tool mapped it to a clean error: ${shortErr(addA)}`);
    } else {
      instA = idOf(addA);
      allOk = record("add_deal_installment (deal A)", !addA.isError && !!instA, instA ? `installment_id=${instA}` : shortErr(addA)) && allOk;
    }

    const addB = await call("pipedrive_add_deal_installment", { id: dealB, description: `Smoke B ${stamp}`, amount: 750, billing_date: billingDate });
    if (isNotEntitled(addB)) {
      notEntitled = true;
      block("add_deal_installment (deal B)", `account is NOT installments-entitled (needs Growth+). The tool mapped it to a clean error: ${shortErr(addB)}`);
    } else {
      instB = idOf(addB);
      allOk = record("add_deal_installment (deal B)", !addB.isError && !!instB, instB ? `installment_id=${instB}` : shortErr(addB)) && allOk;
    }

    // ── Acceptance 1: LIST with one and multiple deal_ids ─────────────────────
    console.log("\nAcceptance: list_deal_installments (single + multiple deal_ids)...\n");

    const listOne = await call("pipedrive_list_deal_installments", { deal_ids: [dealA] });
    if (isNotEntitled(listOne)) {
      notEntitled = true;
      block("list_deal_installments (single deal_id)", `not installments-entitled; tool mapped it cleanly: ${shortErr(listOne)}`);
    } else {
      const oneIds = installmentIds(listOne);
      allOk = record(
        "list_deal_installments (single deal_id)",
        !listOne.isError && (instA === undefined || oneIds.includes(instA)),
        listOne.isError ? shortErr(listOne) : `returned installment ids: [${oneIds.join(", ")}]`,
      ) && allOk;
    }

    const listBoth = await call("pipedrive_list_deal_installments", { deal_ids: [dealA, dealB] });
    if (isNotEntitled(listBoth)) {
      notEntitled = true;
      block("list_deal_installments (multiple deal_ids -> comma-join resolves server-side)", `not installments-entitled; tool mapped it cleanly: ${shortErr(listBoth)}`);
    } else {
      const bothIds = installmentIds(listBoth);
      const hasA = instA !== undefined && bothIds.includes(instA);
      const hasB = instB !== undefined && bothIds.includes(instB);
      allOk = record(
        "list_deal_installments (multiple deal_ids -> comma-join resolves server-side)",
        !listBoth.isError && hasA && hasB,
        listBoth.isError
          ? shortErr(listBoth)
          : `returned ids [${bothIds.join(", ")}]; deal A installment present=${hasA}, deal B present=${hasB}. ` +
            `(If only B were present, the client had collapsed repeated keys instead of comma-joining.)`,
      ) && allOk;
      console.log("\n  Raw multi-id list response (paste into #76):");
      console.log("  " + bodyText(listBoth).split("\n").join("\n  "));
    }

    // ── Acceptance 2 (part 2): UPDATE ─────────────────────────────────────────
    console.log("\nAcceptance: update_deal_installment...\n");
    if (instA === undefined) {
      skip("update_deal_installment (deal A)", notEntitled ? "add was BLOCKED (account not entitled), so there is no installment to update" : "add did not return an installment id");
    } else {
      const upd = await call("pipedrive_update_deal_installment", { id: dealA, installment_id: instA, amount: 333.33, description: `Smoke A updated ${stamp}` });
      allOk = record("update_deal_installment (deal A)", !upd.isError, upd.isError ? shortErr(upd) : `updated installment ${instA}`) && allOk;
    }

    // ── Acceptance 2 (part 3): DELETE (destructive-gated) ─────────────────────
    console.log("\nAcceptance: delete_deal_installment (requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true)...\n");
    if (instA === undefined) {
      skip("delete_deal_installment (deal A)", notEntitled ? "add was BLOCKED (account not entitled), so there is no installment to delete" : "add did not return an installment id");
    } else {
      const delA = await call("pipedrive_delete_deal_installment", { id: dealA, installment_id: instA });
      allOk = record("delete_deal_installment (deal A)", !delA.isError, delA.isError ? shortErr(delA) : `deleted installment ${instA}`) && allOk;
      if (!delA.isError) instA = undefined;
    }

    if (instB === undefined) {
      skip("delete_deal_installment (deal B)", notEntitled ? "add was BLOCKED (account not entitled), so there is no installment to delete" : "add did not return an installment id");
    } else {
      const delB = await call("pipedrive_delete_deal_installment", { id: dealB, installment_id: instB });
      allOk = record("delete_deal_installment (deal B)", !delB.isError, delB.isError ? shortErr(delB) : `deleted installment ${instB}`) && allOk;
      if (!delB.isError) instB = undefined;
    }
  } finally {
    // ── Teardown (best-effort) ────────────────────────────────────────────────
    if (keep) {
      console.log(`\nTeardown skipped (--keep). Leftover: dealA=${dealA}, dealB=${dealB}, product=${productId}, instA=${instA ?? "-"}, instB=${instB ?? "-"}`);
    } else {
      console.log("\nTeardown: deleting throwaway installments / deals / product...\n");
      if (instA !== undefined && dealA !== undefined) {
        const r = await call("pipedrive_delete_deal_installment", { id: dealA, installment_id: instA });
        if (r.isError) warn("teardown: delete leftover installment A", shortErr(r));
      }
      if (instB !== undefined && dealB !== undefined) {
        const r = await call("pipedrive_delete_deal_installment", { id: dealB, installment_id: instB });
        if (r.isError) warn("teardown: delete leftover installment B", shortErr(r));
      }
      for (const [label, dealId] of [["A", dealA], ["B", dealB]] as const) {
        if (dealId === undefined) continue;
        const r = await call("pipedrive_delete_deal", { id: dealId });
        if (r.isError) warn(`teardown: delete deal ${label} (${dealId})`, shortErr(r));
        else console.log(`  cleaned up deal ${label} (${dealId})`);
      }
      if (productId !== undefined) {
        const r = await call("pipedrive_delete_product", { id: productId });
        if (r.isError) warn(`teardown: delete product (${productId})`, shortErr(r));
        else console.log(`  cleaned up product (${productId})`);
      }
    }
  }

  return allOk;
}

// ── entrypoint ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { mode, keep, help, confirmSandbox } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(HELP);
    return;
  }

  if (!process.env.PIPEDRIVE_API_KEY) {
    console.error("ERROR: PIPEDRIVE_API_KEY is not set. Export a sandbox token first (see docs/installments-smoke-test.md).");
    process.exitCode = 1;
    return;
  }

  console.log("====================================================================");
  console.log(" Deal-installments live smoke test (issue #76)");
  console.log("====================================================================");
  console.log(` Token in use: ${tokenTail()}`);

  let ok = false;
  if (mode === "not-entitled") {
    ok = await runNotEntitled();
  } else if (mode === "full") {
    if (process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE !== "true") {
      console.error(
        "\nERROR: full mode performs delete + teardown, so it requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true.\n" +
        "Re-run with:  PIPEDRIVE_ENABLE_DESTRUCTIVE=true npm run smoke:installments -- --confirm-sandbox\n",
      );
      process.exitCode = 1;
      return;
    }
    if (!confirmSandbox) {
      console.error(
        "\nERROR: full mode CREATES and DELETES real deals/products on the account behind the token above.\n" +
        "It must target a throwaway Growth+ SANDBOX, never a production account.\n" +
        "src auto-loads the repo .env, so an unset PIPEDRIVE_API_KEY silently falls back to that token,\n" +
        "double-check the 'Token in use' tail above matches your sandbox, then pass --confirm-sandbox:\n\n" +
        "  PIPEDRIVE_API_KEY=<sandbox-token> PIPEDRIVE_ENABLE_DESTRUCTIVE=true \\\n" +
        "    npm run smoke:installments -- --confirm-sandbox\n",
      );
      process.exitCode = 1;
      return;
    }
    ok = await runFull(keep);
  } else {
    console.error(`Unknown --mode=${mode}. Use --mode=full or --mode=not-entitled.`);
    process.exitCode = 1;
    return;
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n====================================================================");
  console.log(" Summary");
  console.log("====================================================================");
  const icons: Record<Check["status"], string> = { PASS: "✅", FAIL: "❌", WARN: "⚠️ ", BLOCKED: "🔒", SKIP: "⏭️ " };
  for (const c of checks) {
    console.log(`  ${icons[c.status]} ${c.status.padEnd(7)}  ${c.name}`);
  }
  const failed = checks.filter((c) => c.status === "FAIL").length;
  const blocked = checks.filter((c) => c.status === "BLOCKED").length;

  let verdict: string;
  if (failed > 0) {
    verdict =
      `${failed} CHECK(S) FAILED ❌. A tool behaved unexpectedly. Paste this output into issue #76 ` +
      `and file a discrepancy bug with the failing check's raw response.`;
  } else if (blocked > 0) {
    verdict =
      `ACCOUNT NOT INSTALLMENTS-ENTITLED 🔒. The installments tools reached the API and returned a clean ` +
      `not-entitled error (this satisfies acceptance criterion 3: not a crash), but the round-trip and ` +
      `comma-join list (criteria 1-2) could not be verified because this account is not on Growth+. ` +
      `Get a Growth+ token (see docs/installments-smoke-test.md) and re-run, or email ` +
      `marketplace.devs@pipedrive.com to enable installments on this sandbox.`;
  } else {
    verdict = `ALL CRITICAL CHECKS PASSED ✅. Paste this output into issue #76 to close it.`;
  }
  console.log(`\n  ${verdict}\n`);
  process.exitCode = ok && failed === 0 && blocked === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("\nFATAL (unexpected exception; this itself is a finding for #76):", err);
  process.exitCode = 1;
});
