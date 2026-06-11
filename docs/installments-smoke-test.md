# Deal-installments live smoke test (issue #76)

The four deal-installments tools (`pipedrive_list_deal_installments`,
`pipedrive_add_deal_installment`, `pipedrive_update_deal_installment`,
`pipedrive_delete_deal_installment`) shipped in #67. Installments are a
**Growth-plan-and-above** Pipedrive feature, so CI can only exercise them against
mocked fetch. Their real wire behaviour (auth scope, body shape, the comma-joined
`deal_ids` query param, and the not-entitled error envelope) has never been hit
against a live account.

`scripts/smoke-installments.ts` runs that one-time manual smoke for you. It drives
the **real** production code path (`handleCallTool` -> Zod validation -> handler ->
client), not a reimplementation, so a green run is genuine evidence the tools work
on the wire.

---

## 1. Get a Growth+ API token

Installments require **Growth plan or higher** (Pipedrive KB: "Recurring products
and installments"; up to 36 installments per deal). You need a token from a
Growth+ account. Three routes, most reliable first:

### Option A - Free 14-day trial (most reliable, fastest)

1. Go to <https://www.pipedrive.com/en/pricing> and start a free trial (no credit
   card required).
2. During or after signup, make sure the company is on the **Growth plan or higher**
   (the trial exposes paid-tier features; pick Growth+ if prompted). Confirm
   installments are available: open a deal, add a one-time product, and look for the
   "Installments" section in the product/payment area. If you can add an installment
   in the UI, the API token will be entitled too.
3. Get the API token: top-right avatar -> **Company settings** (or **Personal
   preferences**) -> **API** -> copy your personal API token (40 characters).
   (Same place referenced by `config.ts` and `.env.example`.)

This is throwaway by nature (trial company), which makes it ideal for the
create/delete round-trip below.

### Option B - Developer sandbox account

Pipedrive offers developer sandbox accounts for testing:

1. Request one via the form linked at <https://developers.pipedrive.com/> (see
   "Pipedrive Developer Sandbox account - Getting started":
   <https://pipedrive.readme.io/docs/developer-sandbox-account>).
2. Sandboxes are "essentially like a regular Pipedrive company account," capped at
   5 seats, and go inactive if you create no apps within 45 days of signup.
3. **Caveat:** Pipedrive's docs do **not** state which plan tier a sandbox is
   provisioned on, and the developer community has not confirmed it includes
   Growth+ features. Before relying on it, verify installments work in the sandbox
   UI (Option A step 2). If they are not available, email
   `marketplace.devs@pipedrive.com` and ask for Growth+ (installments) entitlement
   on the sandbox, or just use Option A.

### Option C - An existing Growth+ account

If you already administer a Growth+ Pipedrive account, you can use its token.
**Do not** run the full round-trip (Section 2) against a production account, it
creates and deletes real deals/products. Use a trial or sandbox instead.

> The token goes in your shell as `PIPEDRIVE_API_KEY`. The repo's gitignored
> `.env` is only a fallback (see the safety note in Section 2).

---

## 2. Run the full round-trip

Covers acceptance criteria 1 and 2: `add` / `update` / `delete` round-trip on a
sandbox deal, plus `list` with one and with multiple `deal_ids` (proving the
comma-joined query param resolves server-side rather than collapsing repeated keys).

The harness creates a throwaway product and two throwaway deals (each gets a
one-time product, the installments precondition), adds an installment to each,
lists, updates, deletes, then cleans everything up.

```bash
PIPEDRIVE_API_KEY=<your-growth-plus-token> \
PIPEDRIVE_ENABLE_DESTRUCTIVE=true \
  npm run smoke:installments -- --confirm-sandbox
```

Flags / safety:

- `--confirm-sandbox` is **required** for full mode. It affirms the token points at
  a throwaway sandbox, because full mode creates and deletes real records.
- `src/index.ts` does `import "dotenv/config"`, so the harness auto-loads the repo
  `.env`. An explicit `PIPEDRIVE_API_KEY=…` on the command line **overrides** `.env`
  (dotenv never overwrites an already-set var). If you forget to set it, full mode
  refuses and prints the masked tail (`…abcd`) of whatever token it would have used,
  so check that tail matches your sandbox before adding `--confirm-sandbox`.
- `PIPEDRIVE_ENABLE_DESTRUCTIVE=true` is required (the delete + teardown steps go
  through the server's destructive guard).
- `--keep` skips teardown if you want to inspect the created records.

A green run prints `ALL CRITICAL CHECKS PASSED`. Each check also prints the raw API
response so you can paste the evidence into the issue.

---

## 3. Run the not-entitled error-path check (optional, acceptance criterion 3)

Confirms a non-Growth token returns a clean mapped error envelope, not a crash.
Read-only (one `list` call), no writes, no destructive flag needed. Use a token
from a **non-Growth** account (e.g. a Lite/Essential account, or a trial that is not
on Growth+):

```bash
PIPEDRIVE_API_KEY=<non-growth-token> \
  npm run smoke:installments -- --mode=not-entitled
```

Expected: the check passes (`isError=true`, structured envelope, no exception) and
prints the mapped error text. Eyeball that it reads as a clean
not-entitled/payment-required message rather than a stack trace. Skip this check if
you only have a Growth+ token.

---

## 4. Record the result

- **All green:** paste the harness output into issue #76 and close it. That output
  is the live-wire evidence the issue asks for.
- **A shape differs from the spec** (a body field, the `deal_ids` handling, or the
  error envelope): file a follow-up bug with the failing check's raw response, and
  fix the handler/schema. Per #76, no code change is expected unless the live shapes
  differ.

## Notes

- This script is intentionally not a vitest test and lives outside `src/`, so it is
  never compiled by `tsc`, linted by `eslint src/`, or collected by vitest. It needs
  a live account, which is exactly why it cannot run in CI.
- `npm run smoke:installments -- --help` prints usage.
