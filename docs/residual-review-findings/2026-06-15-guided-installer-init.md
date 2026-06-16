# Residual review findings — guided installer (`npx … init`)

Branch: `feat/guided-installer-init`. From an independent, un-primed adversarial
code review focused on API-key leak paths. The three writer findings below were
fixed on the branch; the input-echo finding is recorded as a deliberate follow-up.

## Open (deferred by plan)

### Pasted key is echoed to the terminal (no masked input)

`src/cli/init.ts` reads the API key via `readline.question(...)` with
`output: process.stdout`, so the pasted 40-char key is echoed and persists in
terminal scrollback (and `script`/tmux buffers). This is a real exposure channel
and partially undercuts the R18 effort to keep the literal key out of the
*printed* config block — for committed/indirection targets the key lands in no
file, so the prompt echo becomes its only literal appearance.

This was **explicitly deferred** in the plan (`docs/plans/2026-06-15-001-feat-guided-installer-init-plan.md`,
"Deferred to Follow-Up Work: Masked key entry"). Recommended as the top
fast-follow: mask the key prompt (mute readline output during the key answer, or
accept the key via stdin pipe / a `--key-stdin` flag). Severity: medium-high for
multi-user / shared-terminal contexts.

## Fixed on this branch

- **Insecure relocated backup (symlink / predictable temp).** In-tree backups
  now go to a fresh `mkdtemp` (0700) directory with an exclusive (`wx`) write, so
  a predictable name in a world-writable tmpdir can no longer be pre-planted as a
  symlink the backup follows. (`src/cli/write-config.ts`)
- **Backup mode TOCTOU.** Backups are created owner-only (0600) from the start via
  `writeFileSync({ mode: 0o600, flag: "wx" })` instead of copy-then-chmod, closing
  the brief world-readable window. A backup that cannot be made safely aborts to
  print, leaving the original untouched. (`src/cli/write-config.ts`)
- **Leftover temp file holding a literal key on rename failure.** The atomic
  write is wrapped so a `renameSync`/`writeFileSync` failure unlinks the temp file
  and falls back to print rather than leaving a key-bearing `.tmp` behind.
  (`src/cli/write-config.ts`)
