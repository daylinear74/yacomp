# HDBits fixture curation pipeline

This directory holds the **resumable curation tooling** used to mine
regression cases out of large HDBits scrape dumps and the **progress
tracker** that records what has already been processed.

The scrape dumps themselves (`yacomp-fixtures-*/`,
`yacomp-torrents-fixtures-*/` at the repo root) are **gitignored and
local-only** — they contain raw, lightly-sanitized HTML. This tooling
turns them into the small, sanitized, deduplicated cases under
`tests/fixtures/hdbits/cases/`.

## What is committed

- `progress.json` — the tracker. Every dump file that has been reviewed
  is listed under `files` (path → cluster signature). Each structural
  cluster's decision lives under `clusters`:
  - `extracted` — became `cases/<file>`
  - `covered-by-existing` — behavior already locked by a hand-written case
  - `needs-review` — the live parser produced names that look unreliable
    (years / sizes / bitrates / URLs / leaked handles). Revisit and
    curate by hand, or file a parser bug. **See `NEEDS-REVIEW.md` for how
    to triage and action this backlog.**
  - `skipped` — redundant shape; its behavior is already represented.
- `01-*.ts` … `06-*.ts`, `oracle.ts` — the pipeline (below).
- `.scratch/` — intermediate artifacts, gitignored.

## How a future agent resumes

1. Point `01-cluster.ts` `DUMPS` at the local dump dir(s).
2. Run the pipeline. Re-clustering is cheap and deterministic; any dump
   file already present in `progress.json#files` was reviewed in a prior
   run. New/unseen shapes surface as new clusters with no decision yet —
   those are the only ones that need attention.
3. `needs-review` clusters are the standing backlog: the parser detected
   a grid but the source names came out messy. Decide case-by-case
   whether to lock grid-count-only, fix the parser, or skip.

## Pipeline

Run from the repo root (`bun <script>`):

```
01-cluster.ts          # signature every dump file → .scratch/clusters.json
02-pick-candidates.ts  # smallest body per cluster → .scratch/candidates.json
oracle.ts  .scratch/candidates.json  .scratch/oracle-out.json
02b-existing-cases.ts  # existing cases/*.html → .scratch/existing-cands.json
oracle.ts  .scratch/existing-cands.json  .scratch/existing-out.json
03-select.ts           # behavioral dedup keys → .scratch/picks.json
04-generate.ts         # emit new cases + write progress.json
05-sanitize.ts  <files...>   # genericize images, scrub PII (idempotent)
06-compact.ts          # shrink progress.json to its committed form
```

### `oracle.ts` — ground truth

The dedup key is **parser behavior**, not HTML byte-shape. `oracle.ts`
renders each candidate in the real fixture chrome, runs the actual
userscript (`test-entry.ts`) in headless chromium — the same path the
e2e suite uses — and reports the resulting grid count and per-grid
source names. Those become each case's `expected_grids` / `expected_names`.

### Dedup

`03-select.ts` groups candidates by
`slot | grids | column-counts | clean-vs-polluted | name-strategy`
(strategy = color-span / strong / showhide / plain-vs / numeric-label).
One cleanest, most-minimal representative is kept per key; keys already
covered by a hand-written case are dropped. This is the "remove
duplicate cases" step.

### Sanitization (`05-sanitize.ts`)

Applied to every emitted body, idempotent:

- every unique `t/i/img.hdbits.org/<hash>` → deterministic `g01`, `g02`,
  … (consistent across thumb src and full-image href)
- external (non-hdbits) `<img>`/`<a>` and bare text URLs → `example.invalid`
- `redir.php?url=<base64>` targets stripped
- residual `@mentions` → `@User`; torrent/user ids → `999999`/`100001`;
  passkeys removed

Keep structural HTML, `t.hdbits.org` thumbs, and source labels — those
are what the parser walks. See `../README.md` for the full checklist.
