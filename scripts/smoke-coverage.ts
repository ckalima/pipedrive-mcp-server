#!/usr/bin/env tsx
/**
 * Comprehensive live smoke test for the Pipedrive MCP server.
 *
 * WHY THIS EXISTS
 * The whole server is otherwise tested only against MOCKED `fetch` (even the
 * `tests/contract/` OpenAPI harness validates only the REQUEST shape we send,
 * never a real RESPONSE). So every tool's response parsing, pagination
 * extraction, and the server's acceptance of our write bodies are unproven on
 * the wire. This script drives the REAL production path
 * (`handleCallTool` -> Zod validation -> handler -> client) against a live
 * Pipedrive account so real-shape / real-acceptance bugs CI cannot catch get
 * caught at least once. It mirrors the proven `scripts/smoke-installments.ts`
 * pattern (issue #76).
 *
 * It is intentionally NOT a vitest test and lives outside `src/`, so it is never
 * compiled by `tsc` (`include: ["src/**\/*"]`), linted by `eslint src/`, or
 * collected by vitest (`tests/**\/*.test.ts`).
 *
 * ---------------------------------------------------------------------------
 * SECTIONS
 *   A  Broad READS (read-only, low risk). Lists every entity (v2 + the v1
 *      notes/mail/users path), validates the {summary,data,pagination} envelope
 *      and pagination extractors, and `get`s the first item of each list. Also
 *      reads sub-resource lists (followers/products/discounts/variations/images)
 *      off whatever first entity already exists.
 *   B  #60 `field_code` live confirmation (read-only). Confirms field-list
 *      responses key on `field_code`, records whether they also carry legacy
 *      `key`, and confirms `get_field` resolves a field by its `field_code`.
 *   C  WRITES / sub-resources (creates throwaway records, exercises the
 *      never-live write paths, tears everything down in a reverse-order
 *      registry). Requires PIPEDRIVE_ENABLE_DESTRUCTIVE=true AND --confirm-sandbox.
 *
 * USAGE
 *   # Reads + #60 only (no writes, no flags needed):
 *   PIPEDRIVE_API_KEY=<token> npm run smoke:coverage -- --sections=A,B
 *
 *   # Everything, including the destructive write round-trips (Growth+ trial):
 *   PIPEDRIVE_API_KEY=<trial-token> PIPEDRIVE_ENABLE_DESTRUCTIVE=true \
 *     npm run smoke:coverage -- --confirm-sandbox
 *
 * FLAGS
 *   --sections=A,B,C   which sections to run (default: A,B,C)
 *   --confirm-sandbox  REQUIRED for Section C; affirms the token is a throwaway
 *                      sandbox (Section C CREATES and DELETES real records).
 *   --keep             skip teardown (leave the throwaway records behind)
 *   --help
 *
 * EXIT CODE: 0 = no FAIL (BLOCKED/SKIP are acceptable for a coverage run),
 *            1 = at least one check FAILED (a real-shape / acceptance discrepancy).
 *
 * Any FAIL is a finding: file a GitHub issue with the printed raw response and
 * fix the handler/schema. Plan-gated 402/403 is reported 🔒 BLOCKED, not FAIL.
 * ---------------------------------------------------------------------------
 */
import { handleCallTool } from "../src/index.js";

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// A tiny 1x1 transparent PNG (base64), so the image-upload test needs no file.
const PNG_1X1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── harness helpers (mirrors scripts/smoke-installments.ts) ──────────────────

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await handleCallTool({ params: { name, arguments: args } })) as ToolResult;
}

function bodyText(r: ToolResult): string {
  return r?.content?.[0]?.text ?? "";
}

function parseBody(r: ToolResult): Any {
  try {
    return JSON.parse(bodyText(r));
  } catch {
    return null;
  }
}

/** Single-resource id from a `{data:{id}}` (or `{data:{data:{id}}}`) envelope. */
function idOf(r: ToolResult): number | string | undefined {
  const p = parseBody(r);
  return p?.data?.id ?? p?.data?.data?.id;
}

/** The `data` array from a list `{summary,data:[...],pagination}` envelope. */
function listData(r: ToolResult): Any[] {
  const p = parseBody(r);
  return Array.isArray(p?.data) ? p.data : [];
}

function firstItemId(r: ToolResult): number | string | undefined {
  return listData(r)[0]?.id;
}

function summaryOf(r: ToolResult): string {
  return parseBody(r)?.summary ?? "";
}

type Status = "PASS" | "FAIL" | "WARN" | "BLOCKED" | "SKIP";
type Check = { name: string; status: Status; detail: string };
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

function rawDump(label: string, r: ToolResult): void {
  console.log(`\n  --- raw: ${label} ---`);
  console.log("  " + bodyText(r).split("\n").join("\n  "));
  console.log("  --- end raw ---\n");
}

/** A clean not-entitled error (wrong plan / lacking permission), not a crash or a real bug. */
function isNotEntitled(r: ToolResult): boolean {
  const t = bodyText(r);
  return r.isError === true && (t.includes("PERMISSION_DENIED") || /subscription plan/i.test(t));
}

/** Broader "this feature is not on the account's plan/permission" detector for Section C. */
function planGated(r: ToolResult): boolean {
  if (!r?.isError) return false;
  const t = bodyText(r);
  return (
    /PERMISSION_DENIED/.test(t) ||
    /subscription plan/i.test(t) ||
    /payment required/i.test(t) ||
    /\b40[23]\b/.test(t) ||
    /not (available|enabled).{0,30}(plan|feature|account)/i.test(t) ||
    /feature is not (available|enabled)/i.test(t) ||
    /upgrade your plan/i.test(t)
  );
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function tokenTail(): string {
  const t = process.env.PIPEDRIVE_API_KEY ?? "";
  return t.length >= 4 ? `…${t.slice(-4)} (len ${t.length})` : "(unset)";
}

// ── teardown registry (reverse-order, idempotent) ────────────────────────────

type Track = { label: string; tool: string; args: Record<string, unknown>; done: boolean };
const tracked: Track[] = [];

function track(label: string, tool: string, args: Record<string, unknown>): Track {
  const t: Track = { label, tool, args, done: false };
  tracked.push(t);
  return t;
}

async function teardown(keep: boolean): Promise<void> {
  if (keep) {
    const pending = tracked.filter((t) => !t.done).map((t) => t.label);
    console.log(`\nTeardown skipped (--keep). Leftover records: ${pending.join(", ") || "(none)"}`);
    return;
  }
  console.log("\n── Teardown (best-effort, reverse creation order) ──\n");
  for (const t of [...tracked].reverse()) {
    if (t.done) continue;
    try {
      const r = await call(t.tool, t.args);
      if (r.isError) warn(`teardown: ${t.label}`, shortErr(r));
      else console.log(`  cleaned up ${t.label}`);
    } catch (e) {
      warn(`teardown: ${t.label}`, String(e));
    }
    t.done = true;
  }
}

/** Acceptance-level delete: records PASS/FAIL and, on success, marks its track done. */
async function deleteProbe(label: string, tool: string, args: Record<string, unknown>, t?: Track): Promise<boolean> {
  const r = await call(tool, args);
  const ok = record(`delete: ${label}`, !r.isError, r.isError ? shortErr(r) : "deleted");
  if (ok && t) t.done = true;
  return ok;
}

// ── generic read probes ──────────────────────────────────────────────────────

async function probeList(label: string, tool: string, args: Record<string, unknown> = {}): Promise<ToolResult | undefined> {
  let r: ToolResult;
  try {
    r = await call(tool, args);
  } catch (e) {
    record(`read: ${label}`, false, `handler THREW: ${String(e)}`);
    return undefined;
  }
  if (planGated(r)) {
    block(`read: ${label}`, shortErr(r));
    return undefined;
  }
  const p = parseBody(r);
  const ok = !r.isError && Array.isArray(p?.data);
  const pg = p?.pagination;
  const pgStr = pg
    ? `pagination={has_more:${pg.has_more}${pg.next_cursor ? ",next_cursor:set" : ""}}`
    : "(no pagination block)";
  record(
    `read: ${label}`,
    ok,
    ok ? `${listData(r).length} item(s); ${pgStr}; summary="${summaryOf(r)}"` : shortErr(r),
  );
  return ok ? r : undefined;
}

/** A 404 the tool mapped cleanly — benign for optional sub-resources (e.g. a person with no picture). */
function benignNotFound(r: ToolResult): boolean {
  return r?.isError === true && /NOT_FOUND/.test(bodyText(r));
}

async function probeGet(
  label: string,
  tool: string,
  args: Record<string, unknown>,
  opts: { notFoundIsBenign?: boolean } = {},
): Promise<ToolResult | undefined> {
  let r: ToolResult;
  try {
    r = await call(tool, args);
  } catch (e) {
    record(`read: ${label}`, false, `handler THREW: ${String(e)}`);
    return undefined;
  }
  if (planGated(r)) {
    block(`read: ${label}`, shortErr(r));
    return undefined;
  }
  if (opts.notFoundIsBenign && benignNotFound(r)) {
    skip(`read: ${label}`, `clean NOT_FOUND (optional resource absent on this account): ${shortErr(r)}`);
    return undefined;
  }
  const p = parseBody(r);
  const ok = !r.isError && p?.data != null;
  record(`read: ${label}`, ok, ok ? `ok; summary="${summaryOf(r)}"` : shortErr(r));
  return ok ? r : undefined;
}

/** List a collection, then `get` its first item to validate the get-by-id shape. */
async function probeListThenGet(
  label: string,
  listTool: string,
  getTool: string,
  listArgs: Record<string, unknown> = {},
  idArg = "id",
): Promise<void> {
  const lr = await probeList(label, listTool, listArgs);
  if (!lr) return;
  const id = firstItemId(lr);
  if (id === undefined) {
    skip(`read: ${label} → get first`, "list returned no items");
    return;
  }
  await probeGet(`${label} → get ${getTool}(${idArg}=${id})`, getTool, { [idArg]: id });
}

// ── Section A: broad reads ───────────────────────────────────────────────────

async function sectionA(): Promise<void> {
  console.log("\n====================================================================");
  console.log(" Section A — broad READS (response shape + pagination, v2 + v1)");
  console.log("====================================================================\n");

  // v2 core entities: list + get-first.
  await probeListThenGet("deals", "pipedrive_list_deals", "pipedrive_get_deal");
  await probeListThenGet("persons", "pipedrive_list_persons", "pipedrive_get_person");
  await probeListThenGet("organizations", "pipedrive_list_organizations", "pipedrive_get_organization");
  await probeListThenGet("activities", "pipedrive_list_activities", "pipedrive_get_activity");
  await probeListThenGet("products", "pipedrive_list_products", "pipedrive_get_product");
  await probeListThenGet("projects", "pipedrive_list_projects", "pipedrive_get_project");
  await probeListThenGet("tasks", "pipedrive_list_tasks", "pipedrive_get_task");
  await probeListThenGet("leads", "pipedrive_list_leads", "pipedrive_get_lead");

  // Boards/phases: list_boards has no params; list_phases REQUIRES board_id.
  const boards = await probeList("boards", "pipedrive_list_boards");
  const boardId = boards ? firstItemId(boards) : undefined;
  if (boards) {
    if (boardId === undefined) skip("read: boards → get/phases", "no boards exist");
    else {
      await probeGet(`boards → get_board(id=${boardId})`, "pipedrive_get_board", { id: boardId });
      const phases = await probeList(`phases(board_id=${boardId})`, "pipedrive_list_phases", { board_id: boardId });
      const phaseId = phases ? firstItemId(phases) : undefined;
      if (phaseId !== undefined) await probeGet(`phases → get_phase(id=${phaseId})`, "pipedrive_get_phase", { id: phaseId });
    }
  }

  // Pipelines/stages (no get_pipeline tool exists; stages have get_stage).
  await probeList("pipelines", "pipedrive_list_pipelines");
  await probeListThenGet("stages", "pipedrive_list_stages", "pipedrive_get_stage");

  // Archived collections + templates.
  await probeList("archived_deals", "pipedrive_list_archived_deals");
  await probeList("archived_leads", "pipedrive_list_archived_leads");
  await probeList("archived_projects", "pipedrive_list_archived_projects");
  await probeListThenGet("project_templates", "pipedrive_list_project_templates", "pipedrive_get_project_template");

  // v1 path: notes, mail, users (exercises the offset-pagination extractor + query auth).
  await probeListThenGet("notes (v1)", "pipedrive_list_notes", "pipedrive_get_note");
  const threads = await probeList("mail_threads (v1)", "pipedrive_list_mail_threads");
  if (threads) {
    const threadId = firstItemId(threads);
    if (threadId === undefined) skip("read: mail_thread/message", "no mail threads (trial likely has no synced mailbox)");
    else {
      const tr = await probeGet(`mail → get_mail_thread(id=${threadId})`, "pipedrive_get_mail_thread", { id: threadId });
      // Best-effort: only some thread shapes expose message ids; skip otherwise.
      const msgId = tr ? (parseBody(tr)?.data?.messages?.[0]?.id ?? parseBody(tr)?.data?.mail_messages?.[0]?.id) : undefined;
      if (msgId !== undefined) await probeGet(`mail → get_mail_message(id=${msgId})`, "pipedrive_get_mail_message", { id: msgId });
      else skip("read: get_mail_message", "no message id surfaced by the thread response");
    }
  }
  await probeListThenGet("users (v1)", "pipedrive_list_users", "pipedrive_get_user");
  await probeGet("current user (v1, /users/me)", "pipedrive_get_current_user", {});

  // Sub-resource list reads off whatever first entity already exists (no writes).
  console.log("\n── Section A2 — sub-resource list reads on existing first-entity ids ──\n");
  const firstDeal = firstItemId((await call("pipedrive_list_deals", { limit: 1 })) as ToolResult);
  if (typeof firstDeal === "number") {
    await probeList(`deal_products(deal=${firstDeal})`, "pipedrive_list_deal_products", { id: firstDeal });
    await probeList(`deal_discounts(deal=${firstDeal})`, "pipedrive_list_deal_discounts", { id: firstDeal });
    await probeList(`deal_followers(deal=${firstDeal})`, "pipedrive_list_deal_followers", { id: firstDeal });
    await probeList(`deal_followers_changelog(deal=${firstDeal})`, "pipedrive_get_deal_followers_changelog", { id: firstDeal });
    await probeList(`deal_emails(deal=${firstDeal})`, "pipedrive_get_deal_emails", { id: firstDeal });
    // Installments are Growth+; planGated → BLOCKED inside probeList.
    await probeList(`deal_installments(deal=${firstDeal})`, "pipedrive_list_deal_installments", { deal_ids: [firstDeal] });
  } else {
    skip("read: deal sub-resources", "no existing deal to read sub-resources from");
  }

  const firstPerson = firstItemId((await call("pipedrive_list_persons", { limit: 1 })) as ToolResult);
  if (typeof firstPerson === "number") {
    await probeList(`person_followers(person=${firstPerson})`, "pipedrive_list_person_followers", { id: firstPerson });
    await probeList(`person_followers_changelog(person=${firstPerson})`, "pipedrive_get_person_followers_changelog", { id: firstPerson });
    await probeList(`person_emails(person=${firstPerson})`, "pipedrive_get_person_emails", { id: firstPerson });
    await probeGet(`person_picture(person=${firstPerson})`, "pipedrive_get_person_picture", { id: firstPerson }, { notFoundIsBenign: true });
  } else {
    skip("read: person sub-resources", "no existing person");
  }

  const firstOrg = firstItemId((await call("pipedrive_list_organizations", { limit: 1 })) as ToolResult);
  if (typeof firstOrg === "number") {
    await probeList(`org_followers(org=${firstOrg})`, "pipedrive_list_organization_followers", { id: firstOrg });
    await probeList(`org_followers_changelog(org=${firstOrg})`, "pipedrive_get_organization_followers_changelog", { id: firstOrg });
  } else {
    skip("read: org sub-resources", "no existing organization");
  }

  const firstProduct = firstItemId((await call("pipedrive_list_products", { limit: 1 })) as ToolResult);
  if (typeof firstProduct === "number") {
    await probeList(`product_variations(product=${firstProduct})`, "pipedrive_list_product_variations", { id: firstProduct });
    await probeList(`product_followers(product=${firstProduct})`, "pipedrive_list_product_followers", { id: firstProduct });
    await probeList(`product_followers_changelog(product=${firstProduct})`, "pipedrive_get_product_followers_changelog", { id: firstProduct });
    await probeGet(`product_image(product=${firstProduct})`, "pipedrive_get_product_image", { id: firstProduct }, { notFoundIsBenign: true });
  } else {
    skip("read: product sub-resources", "no existing product");
  }

  const firstProject = firstItemId((await call("pipedrive_list_projects", { limit: 1 })) as ToolResult);
  if (typeof firstProject === "number") {
    await probeList(`project_tasks(project=${firstProject})`, "pipedrive_list_project_tasks", { id: firstProject });
    await probeGet(`project_permitted_users(project=${firstProject})`, "pipedrive_get_project_permitted_users", { id: firstProject });
    await probeList(`project_changelog(project=${firstProject})`, "pipedrive_get_project_changelog", { id: firstProject });
  } else {
    skip("read: project sub-resources", "no existing project (projects may be a plan feature)");
  }
}

// ── Section B: #60 field_code real-shape confirmation ────────────────────────

async function probeFieldShape(label: string, listTool: string, entityType: string): Promise<void> {
  const r = await probeList(`${label}`, listTool);
  if (!r) return;
  const items = listData(r);
  const withFieldCode = items.filter((it) => it?.field_code != null);
  const withKey = items.filter((it) => it?.key != null);
  record(
    `#60: ${label} items carry field_code`,
    withFieldCode.length > 0,
    `${withFieldCode.length}/${items.length} carry field_code; ${withKey.length}/${items.length} carry legacy key. ` +
      (withFieldCode.length === 0
        ? "RESPONSE IS field_code-ABSENT — pre-#60 getField (key-only) would have worked; confirm the #60 (field_code||key) fix is still correct for this shape."
        : withKey.length === 0
          ? "field_code-ONLY shape — pre-#60 key-only matching would have been BROKEN; #60 fix is load-bearing."
          : "both present."),
  );
  const sample = withFieldCode[0] ?? items[0];
  const fc = sample?.field_code ?? sample?.key;
  if (typeof fc !== "string") {
    skip(`#60: ${label} get_field resolves by field_code`, "no field with a field_code/key to resolve");
    return;
  }
  const gr = await call("pipedrive_get_field", { entity_type: entityType, key: fc });
  record(
    `#60: get_field resolves a ${label} field by field_code (key="${fc}")`,
    !gr.isError && parseBody(gr)?.data != null,
    gr.isError ? shortErr(gr) : `resolved name="${parseBody(gr)?.data?.name ?? "?"}"`,
  );
}

async function sectionB(): Promise<void> {
  console.log("\n====================================================================");
  console.log(" Section B — #60 field_code real-shape confirmation (read-only)");
  console.log("====================================================================\n");
  await probeFieldShape("deal_fields", "pipedrive_list_deal_fields", "deal");
  await probeFieldShape("person_fields", "pipedrive_list_person_fields", "person");
  await probeFieldShape("organization_fields", "pipedrive_list_organization_fields", "organization");
  await probeFieldShape("product_fields", "pipedrive_list_product_fields", "product");
  await probeFieldShape("project_fields", "pipedrive_list_project_fields", "project");
}

// ── Section C: writes / sub-resources ────────────────────────────────────────

async function c1_fieldCrud(stamp: number): Promise<void> {
  console.log("\n── C1 — Field CRUD + bulk option verbs (deal field) ──\n");
  const createRes = await call("pipedrive_create_deal_field", {
    field_name: `Smoke field ${stamp}`,
    field_type: "enum",
    options: [{ label: "Alpha" }, { label: "Beta" }, { label: "Gamma" }],
  });
  rawDump("create_deal_field (enum w/ options)", createRes);
  if (planGated(createRes)) {
    block("create_deal_field", shortErr(createRes));
    return;
  }
  const fcData = parseBody(createRes)?.data;
  const fieldCode: string | undefined = fcData?.field_code ?? fcData?.key;
  const createdOk = record(
    "create_deal_field (enum w/ options) returns a field_code",
    !createRes.isError && typeof fieldCode === "string",
    createRes.isError ? shortErr(createRes) : `field_code=${fieldCode}`,
  );
  if (!createdOk || !fieldCode) return;
  const fieldTrack = track(`deal_field ${fieldCode}`, "pipedrive_delete_deal_field", { field_code: fieldCode });

  record(
    "create_deal_field: field_code is a 40-char hash",
    fieldCode.length === 40,
    `field_code length=${fieldCode.length} (#60/#70 expect a server-generated 40-char hash)`,
  );

  const opts: Any[] = Array.isArray(fcData?.options) ? fcData.options : [];
  const optIds: number[] = opts.map((o) => o?.id).filter((n) => typeof n === "number");
  record(
    "create_deal_field: created options carry numeric ids",
    optIds.length >= 2,
    `option ids=[${optIds.join(", ")}] (needed for the bulk option verbs)`,
  );

  const upd = await call("pipedrive_update_deal_field", { field_code: fieldCode, field_name: `Smoke field upd ${stamp}` });
  record("update_deal_field (rename via field_code)", !upd.isError, upd.isError ? shortErr(upd) : "renamed");

  if (optIds.length >= 1) {
    const updOpts = await call("pipedrive_update_deal_field_options", {
      field_code: fieldCode,
      options: [{ id: optIds[0], label: `Alpha-renamed ${stamp}` }],
    });
    record(
      "update_deal_field_options (top-level PATCH array body)",
      !updOpts.isError,
      updOpts.isError ? shortErr(updOpts) : `renamed option ${optIds[0]}`,
    );
  } else {
    skip("update_deal_field_options", "no option ids were returned by create");
  }

  if (optIds.length >= 2) {
    const delOpts = await call("pipedrive_delete_deal_field_options", {
      field_code: fieldCode,
      option_ids: [optIds[optIds.length - 1]],
    });
    record(
      "delete_deal_field_options (body-bearing DELETE array body)",
      !delOpts.isError,
      delOpts.isError ? shortErr(delOpts) : `deleted option ${optIds[optIds.length - 1]}`,
    );
  } else {
    skip("delete_deal_field_options", "need >=2 option ids to delete one safely");
  }

  await deleteProbe(`deal_field ${fieldCode}`, "pipedrive_delete_deal_field", { field_code: fieldCode }, fieldTrack);
}

async function c2_pipelineStageCrud(stamp: number): Promise<void> {
  console.log("\n── C2 — Pipeline / stage CRUD (v2 rename fields) ──\n");
  const pRes = await call("pipedrive_create_pipeline", { name: `Smoke pipeline ${stamp}`, is_deal_probability_enabled: true });
  if (planGated(pRes)) {
    block("create_pipeline", shortErr(pRes));
    return;
  }
  const pipelineId = idOf(pRes);
  if (!record("create_pipeline (is_deal_probability_enabled)", !pRes.isError && pipelineId != null, pRes.isError ? shortErr(pRes) : `pipeline_id=${pipelineId}`))
    return;
  const pTrack = track(`pipeline ${pipelineId}`, "pipedrive_delete_pipeline", { id: pipelineId });

  const sRes = await call("pipedrive_create_stage", {
    name: `Smoke stage ${stamp}`,
    pipeline_id: pipelineId,
    is_deal_rot_enabled: true,
    days_to_rotten: 30,
    deal_probability: 50,
  });
  const stageId = idOf(sRes);
  let sTrack: Track | undefined;
  if (record("create_stage (is_deal_rot_enabled/days_to_rotten/deal_probability)", !sRes.isError && stageId != null, sRes.isError ? shortErr(sRes) : `stage_id=${stageId}`)) {
    sTrack = track(`stage ${stageId}`, "pipedrive_delete_stage", { id: stageId });
  }

  const pUpd = await call("pipedrive_update_pipeline", { id: pipelineId, name: `Smoke pipeline upd ${stamp}` });
  record("update_pipeline", !pUpd.isError, pUpd.isError ? shortErr(pUpd) : "updated");

  if (stageId != null) {
    const sUpd = await call("pipedrive_update_stage", { id: stageId, name: `Smoke stage upd ${stamp}`, deal_probability: 60 });
    record("update_stage", !sUpd.isError, sUpd.isError ? shortErr(sUpd) : "updated");
    await deleteProbe(`stage ${stageId}`, "pipedrive_delete_stage", { id: stageId }, sTrack);
  }
  await deleteProbe(`pipeline ${pipelineId}`, "pipedrive_delete_pipeline", { id: pipelineId }, pTrack);
}

async function c3_dealSubResources(stamp: number): Promise<void> {
  console.log("\n── C3 — Deal sub-resources (products, bulk, discounts) ──\n");
  const prodRes = await call("pipedrive_create_product", { name: `Smoke product ${stamp}`, prices: [{ currency: "USD", price: 100 }] });
  const productId = idOf(prodRes);
  if (!record("create_product (with prices)", !prodRes.isError && productId != null, prodRes.isError ? shortErr(prodRes) : `product_id=${productId}`)) return;
  const prodTrack = track(`product ${productId}`, "pipedrive_delete_product", { id: productId });

  const dealRes = await call("pipedrive_create_deal", { title: `Smoke deal ${stamp}`, value: 1000 });
  const dealId = idOf(dealRes);
  if (!record("create_deal", !dealRes.isError && dealId != null, dealRes.isError ? shortErr(dealRes) : `deal_id=${dealId}`)) return;
  const dealTrack = track(`deal ${dealId}`, "pipedrive_delete_deal", { id: dealId });

  const addProd = await call("pipedrive_add_deal_product", { id: dealId, product_id: productId, item_price: 100, quantity: 2 });
  const attachmentId = idOf(addProd);
  record("add_deal_product", !addProd.isError && attachmentId != null, addProd.isError ? shortErr(addProd) : `product_attachment_id=${attachmentId}`);

  const bulk = await call("pipedrive_bulk_add_deal_products", {
    id: dealId,
    data: [{ product_id: productId, item_price: 50, quantity: 1 }],
  });
  record("bulk_add_deal_products ({data:[...]})", !bulk.isError, bulk.isError ? shortErr(bulk) : "added");

  await probeList(`deal_products(deal=${dealId})`, "pipedrive_list_deal_products", { id: dealId });

  if (typeof attachmentId === "number") {
    const updProd = await call("pipedrive_update_deal_product", { id: dealId, product_attachment_id: attachmentId, item_price: 150 });
    record("update_deal_product (product_attachment_id, not product_id)", !updProd.isError, updProd.isError ? shortErr(updProd) : "updated");
    const delProd = await call("pipedrive_delete_deal_product", { id: dealId, product_attachment_id: attachmentId });
    record("delete_deal_product", !delProd.isError, delProd.isError ? shortErr(delProd) : "deleted line item");
  } else {
    skip("update_deal_product / delete_deal_product", "add_deal_product did not return a product_attachment_id");
  }

  // Discounts (discount_id is a UUID string, no list pagination).
  const addDisc = await call("pipedrive_add_deal_discount", { id: dealId, description: `Smoke disc ${stamp}`, amount: 10, type: "percentage" });
  rawDump("add_deal_discount", addDisc);
  const discountId = idOf(addDisc);
  if (record("add_deal_discount (returns UUID discount_id)", !addDisc.isError && typeof discountId === "string", addDisc.isError ? shortErr(addDisc) : `discount_id=${discountId}`)) {
    await probeList(`deal_discounts(deal=${dealId})`, "pipedrive_list_deal_discounts", { id: dealId });
    const updDisc = await call("pipedrive_update_deal_discount", { id: dealId, discount_id: discountId, amount: 15 });
    record("update_deal_discount", !updDisc.isError, updDisc.isError ? shortErr(updDisc) : "updated");
    const delDisc = await call("pipedrive_delete_deal_discount", { id: dealId, discount_id: discountId });
    record("delete_deal_discount", !delDisc.isError, delDisc.isError ? shortErr(delDisc) : "deleted");
  }

  await deleteProbe(`deal ${dealId}`, "pipedrive_delete_deal", { id: dealId }, dealTrack);
  await deleteProbe(`product ${productId}`, "pipedrive_delete_product", { id: productId }, prodTrack);
}

async function c4_convertDealToLead(stamp: number): Promise<void> {
  console.log("\n── C4 — Convert deal → lead (async job, destructive) ──\n");
  const dealRes = await call("pipedrive_create_deal", { title: `Smoke convert deal ${stamp}`, value: 500 });
  const dealId = idOf(dealRes);
  if (!record("create_deal (for conversion)", !dealRes.isError && dealId != null, dealRes.isError ? shortErr(dealRes) : `deal_id=${dealId}`)) return;
  const dealTrack = track(`convert deal ${dealId}`, "pipedrive_delete_deal", { id: dealId });

  const conv = await call("pipedrive_convert_deal_to_lead", { id: dealId });
  rawDump("convert_deal_to_lead", conv);
  if (planGated(conv)) {
    block("convert_deal_to_lead", shortErr(conv));
    return;
  }
  const conversionId = parseBody(conv)?.data?.conversion_id;
  if (!record("convert_deal_to_lead (returns conversion_id)", !conv.isError && typeof conversionId === "string", conv.isError ? shortErr(conv) : `conversion_id=${conversionId}`)) return;

  // Poll the status endpoint until terminal (completed/failed/rejected) or timeout.
  let terminal = false;
  let lastStatus = "";
  let leadId: string | undefined;
  for (let attempt = 1; attempt <= 6 && !terminal; attempt++) {
    await sleep(2000);
    const st = await call("pipedrive_get_deal_conversion_status", { id: dealId, conversion_id: conversionId });
    if (st.isError) {
      record(`get_deal_conversion_status (attempt ${attempt})`, false, shortErr(st));
      break;
    }
    lastStatus = parseBody(st)?.data?.status ?? "";
    console.log(`         poll ${attempt}: status=${lastStatus}`);
    if (lastStatus === "completed") {
      leadId = parseBody(st)?.data?.lead_id;
      terminal = true;
    } else if (lastStatus === "failed" || lastStatus === "rejected") {
      terminal = true;
    }
  }
  record(
    "get_deal_conversion_status reaches a terminal status",
    terminal,
    terminal ? `final status=${lastStatus}${leadId ? `, lead_id=${leadId}` : ""}` : `did not converge within 12s (last status=${lastStatus || "?"})`,
  );

  if (lastStatus === "completed") {
    // A completed conversion consumes (deletes) the source deal; clean up the produced lead instead.
    dealTrack.done = true;
    if (typeof leadId === "string") track(`converted lead ${leadId}`, "pipedrive_delete_lead", { id: leadId });
  }
}

async function c5_multipartImage(stamp: number): Promise<void> {
  console.log("\n── C5 — Multipart product image (riskiest never-live path) ──\n");
  const prodRes = await call("pipedrive_create_product", { name: `Smoke image product ${stamp}` });
  const productId = idOf(prodRes);
  if (!record("create_product (for image)", !prodRes.isError && productId != null, prodRes.isError ? shortErr(prodRes) : `product_id=${productId}`)) return;
  const prodTrack = track(`image product ${productId}`, "pipedrive_delete_product", { id: productId });

  const up = await call("pipedrive_upload_product_image", {
    id: productId,
    file_name: "smoke.png",
    base64_data: PNG_1X1_B64,
    mime_type: "image/png",
  });
  rawDump("upload_product_image (multipart, base64 1x1 PNG)", up);
  if (planGated(up)) {
    block("upload_product_image", shortErr(up));
  } else {
    record("upload_product_image (multipart base64)", !up.isError, up.isError ? shortErr(up) : "uploaded");
    if (!up.isError) {
      const upd = await call("pipedrive_update_product_image", { id: productId, file_name: "smoke2.png", base64_data: PNG_1X1_B64, mime_type: "image/png" });
      record("update_product_image (PUT multipart)", !upd.isError, upd.isError ? shortErr(upd) : "updated");
      await probeGet(`get_product_image(product=${productId})`, "pipedrive_get_product_image", { id: productId });
      const del = await call("pipedrive_delete_product_image", { id: productId });
      record("delete_product_image", !del.isError, del.isError ? shortErr(del) : "deleted");
    }
  }
  await deleteProbe(`image product ${productId}`, "pipedrive_delete_product", { id: productId }, prodTrack);
}

async function c6_variationsAndFollowers(stamp: number): Promise<void> {
  console.log("\n── C6 — Product variations + cross-entity followers ──\n");

  // Need a user id for follower add (add uses user_id; delete uses follower_id).
  const meRes = await call("pipedrive_get_current_user", {});
  const userId = idOf(meRes);
  if (typeof userId !== "number") {
    warn("followers prerequisite", `could not resolve current user id (followers tests will be skipped): ${shortErr(meRes)}`);
  }

  // Variations on a throwaway product.
  const prodRes = await call("pipedrive_create_product", { name: `Smoke variation product ${stamp}` });
  const productId = idOf(prodRes);
  if (record("create_product (for variation/follower)", !prodRes.isError && productId != null, prodRes.isError ? shortErr(prodRes) : `product_id=${productId}`)) {
    const prodTrack = track(`variation product ${productId}`, "pipedrive_delete_product", { id: productId });

    const addVar = await call("pipedrive_add_product_variation", { id: productId, name: `Var ${stamp}`, prices: [{ currency: "USD", price: 9.99 }] });
    if (planGated(addVar)) {
      block("add_product_variation", shortErr(addVar));
    } else {
      const variationId = idOf(addVar);
      if (record("add_product_variation", !addVar.isError && variationId != null, addVar.isError ? shortErr(addVar) : `variation_id=${variationId}`)) {
        await probeList(`product_variations(product=${productId})`, "pipedrive_list_product_variations", { id: productId });
        const updVar = await call("pipedrive_update_product_variation", { id: productId, product_variation_id: variationId, name: `Var upd ${stamp}` });
        record("update_product_variation", !updVar.isError, updVar.isError ? shortErr(updVar) : "updated");
        const delVar = await call("pipedrive_delete_product_variation", { id: productId, product_variation_id: variationId });
        record("delete_product_variation", !delVar.isError, delVar.isError ? shortErr(delVar) : "deleted");
      }
    }

    if (typeof userId === "number") {
      await followerRoundTrip("product", productId, userId, "pipedrive_add_product_follower", "pipedrive_list_product_followers", "pipedrive_delete_product_follower");
    }
    await deleteProbe(`variation product ${productId}`, "pipedrive_delete_product", { id: productId }, prodTrack);
  }

  // One follower round-trip each for deal / person / org on throwaway records.
  if (typeof userId === "number") {
    const person = await call("pipedrive_create_person", { name: `Smoke follower person ${stamp}` });
    const personId = idOf(person);
    if (personId != null) {
      const t = track(`follower person ${personId}`, "pipedrive_delete_person", { id: personId });
      await followerRoundTrip("person", personId, userId, "pipedrive_add_person_follower", "pipedrive_list_person_followers", "pipedrive_delete_person_follower");
      await deleteProbe(`follower person ${personId}`, "pipedrive_delete_person", { id: personId }, t);
    }

    const org = await call("pipedrive_create_organization", { name: `Smoke follower org ${stamp}` });
    const orgId = idOf(org);
    if (orgId != null) {
      const t = track(`follower org ${orgId}`, "pipedrive_delete_organization", { id: orgId });
      await followerRoundTrip("organization", orgId, userId, "pipedrive_add_organization_follower", "pipedrive_list_organization_followers", "pipedrive_delete_organization_follower");
      await deleteProbe(`follower org ${orgId}`, "pipedrive_delete_organization", { id: orgId }, t);
    }

    const deal = await call("pipedrive_create_deal", { title: `Smoke follower deal ${stamp}` });
    const dealId = idOf(deal);
    if (dealId != null) {
      const t = track(`follower deal ${dealId}`, "pipedrive_delete_deal", { id: dealId });
      await followerRoundTrip("deal", dealId, userId, "pipedrive_add_deal_follower", "pipedrive_list_deal_followers", "pipedrive_delete_deal_follower");
      await deleteProbe(`follower deal ${dealId}`, "pipedrive_delete_deal", { id: dealId }, t);
    }
  } else {
    skip("cross-entity follower round-trips", "no current-user id to add as a follower");
  }
}

/**
 * remove auto-follower → add (user_id) → list → delete (follower_id).
 * The creating user auto-follows every entity they create, so on a single-user
 * sandbox a direct add would always fail with "already following" — removing
 * the auto-follow first makes the add a genuine add. The add/delete param
 * asymmetry (user_id vs follower_id) is intentional.
 */
async function followerRoundTrip(
  entity: string,
  entityId: number | string,
  userId: number,
  addTool: string,
  listTool: string,
  delTool: string,
): Promise<void> {
  const preDel = await call(delTool, { id: entityId, follower_id: userId });
  if (planGated(preDel)) {
    block(`add_${entity}_follower`, shortErr(preDel));
    return;
  }
  record(`delete_${entity}_follower (auto-follow removal)`, !preDel.isError, preDel.isError ? shortErr(preDel) : `removed auto-follower ${userId}`);
  const add = await call(addTool, { id: entityId, user_id: userId });
  record(`add_${entity}_follower (user_id)`, !add.isError, add.isError ? shortErr(add) : `added user ${userId}`);
  await probeList(`${entity}_followers(${entityId})`, listTool, { id: entityId });
  const del = await call(delTool, { id: entityId, follower_id: userId });
  record(`delete_${entity}_follower (follower_id)`, !del.isError, del.isError ? shortErr(del) : `removed follower ${userId}`);
}

async function c7_projectsTasksBoardsPhases(stamp: number): Promise<void> {
  console.log("\n── C7 — Projects / tasks / boards / phases (#68) ──\n");
  const boardRes = await call("pipedrive_create_board", { name: `Smoke board ${stamp}` });
  if (planGated(boardRes)) {
    block("create_board (projects feature)", shortErr(boardRes));
    return;
  }
  const boardId = idOf(boardRes);
  if (!record("create_board", !boardRes.isError && boardId != null, boardRes.isError ? shortErr(boardRes) : `board_id=${boardId}`)) return;
  const boardTrack = track(`board ${boardId}`, "pipedrive_delete_board", { id: boardId });

  const phaseRes = await call("pipedrive_create_phase", { name: `Smoke phase ${stamp}`, board_id: boardId });
  const phaseId = idOf(phaseRes);
  if (!record("create_phase (board_id)", !phaseRes.isError && phaseId != null, phaseRes.isError ? shortErr(phaseRes) : `phase_id=${phaseId}`)) {
    await deleteProbe(`board ${boardId}`, "pipedrive_delete_board", { id: boardId }, boardTrack);
    return;
  }
  const phaseTrack = track(`phase ${phaseId}`, "pipedrive_delete_phase", { id: phaseId });

  const projRes = await call("pipedrive_create_project", { title: `Smoke project ${stamp}`, board_id: boardId, phase_id: phaseId });
  if (planGated(projRes)) {
    block("create_project", shortErr(projRes));
    await deleteProbe(`phase ${phaseId}`, "pipedrive_delete_phase", { id: phaseId }, phaseTrack);
    await deleteProbe(`board ${boardId}`, "pipedrive_delete_board", { id: boardId }, boardTrack);
    return;
  }
  const projectId = idOf(projRes);
  let projectTrack: Track | undefined;
  let taskTrack: Track | undefined;
  if (record("create_project (title/board_id/phase_id)", !projRes.isError && projectId != null, projRes.isError ? shortErr(projRes) : `project_id=${projectId}`)) {
    projectTrack = track(`project ${projectId}`, "pipedrive_delete_project", { id: projectId });

    const taskRes = await call("pipedrive_create_task", { title: `Smoke task ${stamp}`, project_id: projectId, is_done: false, is_milestone: false });
    const taskId = idOf(taskRes);
    if (record("create_task (boolean is_done/is_milestone, #81)", !taskRes.isError && taskId != null, taskRes.isError ? shortErr(taskRes) : `task_id=${taskId}`)) {
      taskTrack = track(`task ${taskId}`, "pipedrive_delete_task", { id: taskId });
      const updTask = await call("pipedrive_update_task", { id: taskId, is_done: true });
      // Assert the flag actually flipped — a bare 200 proved nothing in #81
      // (the API silently ignored the old done field next to other params).
      const updBody = parseBody(updTask);
      const flagApplied = !updTask.isError && updBody?.data?.is_done === true;
      record("update_task (is_done:true applied on the wire, #81)", flagApplied, updTask.isError ? shortErr(updTask) : `is_done=${JSON.stringify(updBody?.data?.is_done)}`);
    }

    await probeList(`project_tasks(project=${projectId})`, "pipedrive_list_project_tasks", { id: projectId });
    await probeGet(`get_project(${projectId})`, "pipedrive_get_project", { id: projectId });
    await probeGet(`get_project_permitted_users(${projectId})`, "pipedrive_get_project_permitted_users", { id: projectId });
    await probeList(`project_changelog(${projectId})`, "pipedrive_get_project_changelog", { id: projectId });
  }

  await probeGet(`get_board(${boardId})`, "pipedrive_get_board", { id: boardId });
  await probeList(`phases(board=${boardId})`, "pipedrive_list_phases", { board_id: boardId });
  await probeGet(`get_phase(${phaseId})`, "pipedrive_get_phase", { id: phaseId });

  // Explicit teardown in dependency order (task → project → phase → board).
  if (taskTrack) await deleteProbe(`task ${taskTrack.args.id}`, "pipedrive_delete_task", { id: taskTrack.args.id }, taskTrack);
  if (projectTrack) await deleteProbe(`project ${projectId}`, "pipedrive_delete_project", { id: projectId }, projectTrack);
  await deleteProbe(`phase ${phaseId}`, "pipedrive_delete_phase", { id: phaseId }, phaseTrack);
  await deleteProbe(`board ${boardId}`, "pipedrive_delete_board", { id: boardId }, boardTrack);
}

async function sectionC(keep: boolean): Promise<void> {
  console.log("\n====================================================================");
  console.log(" Section C — WRITES / sub-resources (throwaway records, teardown)");
  console.log("====================================================================");
  const stamp = Date.now();
  console.log(`   stamp=${stamp}\n`);
  try {
    await c1_fieldCrud(stamp);
    await c2_pipelineStageCrud(stamp);
    await c3_dealSubResources(stamp);
    await c4_convertDealToLead(stamp);
    await c5_multipartImage(stamp);
    await c6_variationsAndFollowers(stamp);
    await c7_projectsTasksBoardsPhases(stamp);
  } finally {
    await teardown(keep);
  }
}

// ── flags / entrypoint ───────────────────────────────────────────────────────

function parseArgs(argv: string[]): { sections: Set<string>; keep: boolean; help: boolean; confirmSandbox: boolean } {
  let sections = new Set(["A", "B", "C"]);
  let keep = false;
  let help = false;
  let confirmSandbox = process.env.SMOKE_CONFIRM_SANDBOX === "true";
  for (const a of argv) {
    if (a.startsWith("--sections=")) sections = new Set(a.slice("--sections=".length).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
    else if (a === "--keep") keep = true;
    else if (a === "--confirm-sandbox") confirmSandbox = true;
    else if (a === "--help" || a === "-h") help = true;
  }
  return { sections, keep, help, confirmSandbox };
}

const HELP = `
smoke-coverage - comprehensive live smoke of the Pipedrive MCP server

  # Reads + #60 field_code only (no writes, no flags needed):
  PIPEDRIVE_API_KEY=<token> npm run smoke:coverage -- --sections=A,B

  # Everything incl. destructive write round-trips (Growth+ trial sandbox):
  PIPEDRIVE_API_KEY=<trial-token> PIPEDRIVE_ENABLE_DESTRUCTIVE=true \\
    npm run smoke:coverage -- --confirm-sandbox

Flags:
  --sections=A,B,C   which sections to run (default: A,B,C)
  --confirm-sandbox  REQUIRED for Section C; affirms the token is a throwaway
                     sandbox (Section C CREATES and DELETES real records).
  --keep             leave the throwaway records behind (skip teardown)
  --help

Env:
  PIPEDRIVE_API_KEY              Pipedrive token. NOTE: src loads dotenv, so a repo
                                 .env is the FALLBACK; an explicit shell var
                                 (PIPEDRIVE_API_KEY=… npm run …) overrides it and is safest.
  PIPEDRIVE_ENABLE_DESTRUCTIVE   must be "true" for Section C (delete + teardown).
  SMOKE_CONFIRM_SANDBOX          "true" is equivalent to passing --confirm-sandbox.

Sections:
  A  broad reads (every entity, v2 + v1, response shape + pagination + sub-resources)
  B  #60 field_code real-shape confirmation (read-only)
  C  writes / sub-resources (field CRUD + bulk options, pipeline/stage CRUD,
     deal products/discounts/bulk, convert-to-lead, multipart product image,
     variations + followers, projects/tasks/boards/phases)
`;

async function main(): Promise<void> {
  const { sections, keep, help, confirmSandbox } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(HELP);
    return;
  }

  if (!process.env.PIPEDRIVE_API_KEY) {
    console.error("ERROR: PIPEDRIVE_API_KEY is not set. Export a sandbox/trial token first.");
    process.exitCode = 1;
    return;
  }

  console.log("====================================================================");
  console.log(" Pipedrive MCP comprehensive live smoke");
  console.log("====================================================================");
  console.log(` Token in use: ${tokenTail()}`);
  console.log(` Sections requested: ${[...sections].join(", ")}`);

  if (sections.has("A")) await sectionA();
  if (sections.has("B")) await sectionB();

  if (sections.has("C")) {
    const destructive = process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE === "true";
    if (!destructive || !confirmSandbox) {
      console.log("\n====================================================================");
      console.log(" Section C — SKIPPED (write round-trips not authorized)");
      console.log("====================================================================");
      console.log(
        "\n Section C CREATES and DELETES real records on the account behind the token above,\n" +
          " so it requires BOTH PIPEDRIVE_ENABLE_DESTRUCTIVE=true AND --confirm-sandbox.\n" +
          ` Currently: PIPEDRIVE_ENABLE_DESTRUCTIVE=${destructive ? "true" : "unset"}, --confirm-sandbox=${confirmSandbox}.\n` +
          " Double-check the 'Token in use' tail matches a throwaway sandbox, then re-run:\n\n" +
          "   PIPEDRIVE_API_KEY=<sandbox-token> PIPEDRIVE_ENABLE_DESTRUCTIVE=true \\\n" +
          "     npm run smoke:coverage -- --confirm-sandbox\n",
      );
      skip("Section C (writes)", "not authorized: need PIPEDRIVE_ENABLE_DESTRUCTIVE=true + --confirm-sandbox");
    } else {
      await sectionC(keep);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n====================================================================");
  console.log(" Summary");
  console.log("====================================================================");
  const icons: Record<Status, string> = { PASS: "✅", FAIL: "❌", WARN: "⚠️ ", BLOCKED: "🔒", SKIP: "⏭️ " };
  const tally: Record<Status, number> = { PASS: 0, FAIL: 0, WARN: 0, BLOCKED: 0, SKIP: 0 };
  for (const c of checks) tally[c.status]++;

  // Re-print only the non-PASS lines so failures/blocks are easy to scan.
  const notable = checks.filter((c) => c.status !== "PASS");
  if (notable.length) {
    console.log("\n Non-PASS checks:");
    for (const c of notable) console.log(`  ${icons[c.status]} ${c.status.padEnd(7)} ${c.name}\n         ${c.detail}`);
  }

  console.log(
    `\n Totals: ✅ ${tally.PASS} PASS · ❌ ${tally.FAIL} FAIL · 🔒 ${tally.BLOCKED} BLOCKED · ⏭️ ${tally.SKIP} SKIP · ⚠️ ${tally.WARN} WARN`,
  );

  let verdict: string;
  if (tally.FAIL > 0) {
    verdict =
      `${tally.FAIL} CHECK(S) FAILED ❌. A tool returned an unexpected real-shape / acceptance result. ` +
      `File a GitHub issue with the failing check's raw response (printed above) and fix the handler/schema.`;
  } else if (tally.PASS === 0 && tally.BLOCKED === 0) {
    verdict = `No checks executed (everything skipped). Re-run with the appropriate --sections and, for Section C, the required flags.`;
  } else if (tally.BLOCKED > 0) {
    verdict =
      `No failures, but ${tally.BLOCKED} surface(s) were 🔒 BLOCKED (plan/permission not entitled — expected for ` +
      `features this tier lacks, NOT a bug). Everything reachable on this account verified clean.`;
  } else {
    verdict = `ALL REACHED CHECKS PASSED ✅. Every exercised surface is now live-verified against real responses.`;
  }
  console.log(`\n ${verdict}\n`);
  process.exitCode = tally.FAIL === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("\nFATAL (unexpected exception; this itself is a finding):", err);
  process.exitCode = 1;
});
