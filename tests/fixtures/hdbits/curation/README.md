# HDBits fixture curation pipeline

This directory holds the **resumable curation tooling** used to mine
regression cases out of large HDBits scrape dumps and the **progress
tracker** that records what has already been processed.

The scrape dumps themselves (`yacomp-fixtures-*/`,
`yacomp-torrents-fixtures-*/` at the repo root) are **gitignored and
local-only** — they contain raw, lightly-sanitized HTML. This tooling
turns them into the small, sanitized, deduplicated cases under
`tests/fixtures/hdbits/cases/`.

## Local setup (required to re-run the pipeline)

The pipeline reads two dump folders that are **not** in the repo. To run
it, obtain them and place **both at the repository root** (next to
`package.json`), keeping their names intact:

```
<repo root>/
├── yacomp-fixtures-2026-05-28/            # forum-post scrapes
│   └── cases-bootstrapped/                # ← the HTML the pipeline reads
├── yacomp-torrents-fixtures-2026-05-28/   # torrent-page scrapes
│   └── cases-bootstrapped/
└── tests/fixtures/hdbits/curation/        # this tooling
```

`01-cluster.ts` looks for `<folder>/cases-bootstrapped` at exactly these
paths (see its `DUMPS` array). The `yacomp-*-fixtures-*/` glob is already
in the root `.gitignore`, so these folders will never be committed. If you
have a differently-dated dump, drop it at the root the same way and update
the dates in `DUMPS`. Without these folders the committed cases and
`progress.json` still work for the test suite — you only need them to mine
new cases.

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
- `gain-review.ts` — a local diff-review UI generator for comparing a saved
  baseline sweep against the current parser sweep. The generated review files and
  marks stay under `.scratch/` and are not committed.
- `DEFERRED.md` — committed rationale for reviewed cases that should stay marked
  `deferred` because a broad parser change would be riskier than the isolated
  fixture.
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

### `gain-review.ts` — diff review UI

`gain-review.ts` is a local review tool for triaging parser changes against the
large dump corpus. It reads:

- `.scratch/_baseline.json` — the accepted/reference sweep.
- `.scratch/new-out.json` — the current parser sweep.

It can also read split sweep files with `--baseline=` and `--new=`. The current
handoff split is:

- `.scratch/_baseline-torrents.json` / `.scratch/new-out-torrents.json`
- `.scratch/_baseline-non-torrents.json` / `.scratch/new-out-non-torrents.json`

It writes only gitignored review artifacts under `.scratch/`:

- `gain-review.*` — rows where the current parser detects more grids.
- `name-review.*` — rows where grid counts are unchanged but source names differ.
- `loss-review.*` — rows where the current parser detects fewer grids.
- `locate-review.*` — rows where grid counts and names are unchanged but the
  `Show comparison` trigger moved.

Each `*.marks.json` stores local review state (`correct`, `wrong`, `deferred`,
`pending`) and each `*.summary.json` stores the current counts. These files are
for local curation and should not be committed.

Generate all four review pages from the repo root:

```
bun tests/fixtures/hdbits/curation/gain-review.ts --all
```

Generate review pages for a split sweep by pointing the tool at the split data
files. Use a separate review scratch directory when you want independent marks
for the split:

```
bun tests/fixtures/hdbits/curation/gain-review.ts --all \
  --scratch=tests/fixtures/hdbits/curation/.scratch/review-torrents \
  --baseline=tests/fixtures/hdbits/curation/.scratch/_baseline-torrents.json \
  --new=tests/fixtures/hdbits/curation/.scratch/new-out-torrents.json
```

Or generate one page:

```
bun tests/fixtures/hdbits/curation/gain-review.ts --kind=name
```

Serve the review UI when you need browser-based marking and persistent saves:

```
bun tests/fixtures/hdbits/curation/gain-review.ts --serve --host=127.0.0.1 --port=4187
```

Open:

- `http://127.0.0.1:4187/gain`
- `http://127.0.0.1:4187/name`
- `http://127.0.0.1:4187/loss`
- `http://127.0.0.1:4187/locate`

Append `?scope=torrents` to show only torrent-page entries, for example
`http://127.0.0.1:4187/name?scope=torrents`. When saving from a scoped page,
only entries in that scope are updated; marks for other entries are preserved.
Append `?scope=non-torrents` for forum/non-torrent entries.

The tracked sweep driver defaults to the torrent corpus:

```
python3 tests/fixtures/hdbits/curation/sweep-driver.py
```

Run non-torrents only when explicitly requested:

```
python3 tests/fixtures/hdbits/curation/sweep-driver.py --scope=non-torrents
```

Use `deferred` for cases that are understood but intentionally not fixed yet
because the generalized parser change is likely to harm more common shapes. Add
the durable rationale to `DEFERRED.md`; keep transient UI marks in `.scratch/`.
If a row note says the original/baseline output is right, keep it marked
`wrong` until the parser is fixed or the owner explicitly accepts a changed
baseline; do not move those rows to `deferred` just to clear the review.

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
