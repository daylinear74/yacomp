# Handoff — HDBits comparison column-title extraction

This subsystem finds screenshot-comparison grids on HDBits pages (torrent
descriptions/comments, forum posts) and labels their columns, then renders an
inline comparison viewer. This doc is for a new maintainer taking the work over.
Read it once, then `README.md` (fixture format) and `curation/RULINGS.md` (the
owner's canonical decisions — **treat as ground truth**).

## ⚠️ Two things are gitignored — ZIP and send them with the repo

A fresh `git clone` does **not** include the validation corpus or the sweep
tooling. To hand off, zip these alongside the repo:

1. `yacomp-fixtures-2026-05-28/` and `yacomp-torrents-fixtures-2026-05-28/`
   — the raw corpus (~7.4k sanitized HDBits bodies), used to look up individual
   cases by id. Place at the repo root.
2. `tests/fixtures/hdbits/curation/.scratch/` — the sweep tooling + data:
   `fast-oracle.ts`, `fast-entry.ts`, `sweep-driver.py`, **`all-cands.json`**
   (17 MB, the 3,685 bodies the sweep runs — self-contained, so the sweep needs
   only this), and **`_baseline.json`** (the reference output to diff against).
   (The rest of `.scratch/` is throwaway experiments — safe to drop.)

Everything else (source, tests, iconic fixtures, templates, rulings) is in git.

## The code

- `src/grid/parser.ts` — the heart. `getGrids()` → `parseGrid()` →
  `collectGroups()` → a precedence-ordered chain of name strategies →
  `reshapeGrid()`. The strategy order in `parseGrid` IS the spec: leading
  vs/`|` line → per-group labels → single-group label → leading bold → structured
  → leading-vs → showhide labels → `hasLocalNonNameHeading` (suppress / H1 /
  gallery) → `findComparisonNames` → H1 fall-through. Special fallbacks:
  `cmpThreadLargestBlock` (comparison-thread OP, incl. the indivisible partial
  grid), `leadingComparisonNamesBeforeContainer` (multi-section parent title),
  the torrent gallery fallback (`Grid.gallery`).
- `src/grid/names.ts` — `splitNames()` and the separator precedence
  (`|` > `vs`/`v.` > `>>>` > `,` > `-` > `/` > `~` > `×`), plus the guards
  `looksLikeNames` / `looksLikeProse` / `stripAsymmetricTitle` / `isFooterLabel`
  and `namesFromHeadings` (the H1 reader, OP-only).
- `src/sites/hdbits.ts` — `setupHDBitsCore()`: slow.pics collection, `getGrids`,
  link insertion, the slow.pics rescue, and the click dispatch
  (`grid.gallery` → "Show viewer" 1-wide; `grid.partial` → `openOrphanSelect`
  picker; else the normal comparison).
- `src/viewer/` — `comparison.ts` (inline viewer), `row.ts`, and
  `orphan-select.ts` (the drop-odd-shot thumbnail picker).

Build/verify: `bun run build` → `dist/yacomp.user.js`; `bun run verify`;
`bun run typecheck`.

## Three test layers

1. **Unit** — `tests/unit/hdbits-rulings.test.ts`: pure-function rulings.
   `bun test tests/unit` (fast, no browser).
2. **E2e** — `tests/e2e/hdbits.spec.ts` + `cases/*.html`: each case is rendered
   in sanitized chrome and driven through the FULL `setupHDBitsCore` (with a
   stubbed slow.pics) + the viewer. `bunx playwright test`. This is the only
   layer that exercises slow.pics claiming and the viewer. Add a case by dropping
   an HTML file with a front-matter header — see `README.md`. `cases/NNN-iconic-*`
   are the locked owner-ruling cases.
3. **Corpus sweep** — the wide net (below).

## The corpus sweep

Validates every parser change against the 3,685 real bodies. It tests
`getGrids()` ONLY — not the slow.pics rescue or the viewer, and it renders each
body as a single post (no multi-post threads). Run:

```sh
rm -f tests/fixtures/hdbits/curation/.scratch/new-out.json
python3 tests/fixtures/hdbits/curation/.scratch/sweep-driver.py   # ~12 min, headless chromium
```

It writes `.scratch/new-out.json` — one row per candidate `{id, grids, names}`
(`grids < 0` = a flaky render; ignore those rows). Diff against the baseline:

```python
import json
S = "tests/fixtures/hdbits/curation/.scratch"
new = {r['id']: r for r in json.load(open(f"{S}/new-out.json"))}
base = {r['id']: r for r in json.load(open(f"{S}/_baseline.json"))}
for id_, n in new.items():
    b = base.get(id_)
    if not b or n['grids'] < 0 or b['grids'] < 0: continue
    if n['grids'] > b['grids']: print("GAIN", id_, b['grids'], "->", n['grids'])
    elif n['grids'] < b['grids']: print("LOSS", id_, b['grids'], "->", n['grids'])   # regression!
    elif json.dumps(n['names']) != json.dumps(b['names']): print("NAME", id_, b['names'], "->", n['names'])
```

**Ship gate: 0 LOSSES** (excluding `grids<0` flakiness). A NAME-change is usually
an improvement — eyeball them. Only `cp new-out.json _baseline.json` to
re-baseline once you've confirmed every delta is intended.

The local sweep driver also writes review pages when there is something to
inspect:

- `.scratch/gain-review.html` / `.scratch/gain-review.json` for `GAIN` rows.
- `.scratch/name-review.html` / `.scratch/name-review.json` for `NAME` rows.
- `.scratch/*-review-marks.json` and `.scratch/*-review-summary.json` for the
  manual decisions.

Start the local review server if you need persistent marking:

```sh
bun tests/fixtures/hdbits/curation/gain-review.ts --serve --port=4187
```

Then open `http://localhost:4187/gain` and `http://localhost:4187/name`.
Opening the HTML files directly is useful for browsing, but only the local
server writes review marks back to `.scratch/`.

Review semantics:

- `GAIN` means `new.grids > baseline.grids`: the current parser found more
  comparison grids/buttons than the baseline.
- `NAME` means `new.grids == baseline.grids` and the parsed name arrays differ.
  `NAME` excludes gain/loss/flaky rows, so it is not double-counting the extra
  names created by `GAIN` rows.
- Rows default to `correct`. Only mark a row `wrong` when the new grid or name
  is actually bad. The summary JSON files are the handoff artifact for the next
  agent.
- Original HDBits links are copied only when the source case header contains a
  `notes: ... scraped from https://hdbits.org/...` value. Do not guess missing
  source URLs.

If a reviewed `GAIN` or `NAME` is wrong, fix the parser/name extraction logic
first (`src/grid/parser.ts` and/or `src/grid/names.ts` are the usual places),
then rerun the focused tests and the sweep. Re-baseline only after every
remaining delta has been reviewed and accepted.

Inspect one case: open its `id` path under the corpus dir, or wrap its body in a
tiny Playwright harness that calls `getGrids()` (see `.scratch/_diag-entry.ts`
for the shape). The sweep's flakiness (occasional `ERR_INVALID_HTTP_RESPONSE` /
timeout) is real — the driver retries chunks; just exclude `grids<0` rows.

## Rulings & curation (`curation/`)

- `RULINGS.md` — canonical owner decisions, each mapped to a unit test and/or
  iconic fixture. The META-RULES and coverage matrix are the contract.
- `UNVERIFIED.md` — behaviors the harness CANNOT verify (live slow.pics fetch &
  perf, `GM_*` runtime, real multi-post threads). Need a real browser / tester.
- `README.md`, `INTERVENTION-NEEDED.md`, `NEEDS-REVIEW.md` — working notes.

## Release

Dev pre-releases ship by pushing a tag `v5.9.0-dev.N`: a GitHub Action builds
`dist/yacomp.user.js` and publishes a prerelease that testers' Tampermonkey
auto-updates. Latest shipped: **`v5.9.0-dev.19`**. To release: bump N,
`git tag -a v5.9.0-dev.N -m "…"`, push branch + tag. **This handoff commit is
intentionally NOT tagged** — the next maintainer decides when to release.

## Conventions

- Branch `test/hdbits-fixture-curation` (this work is not on `main` yet).
- Conventional commits, enforced by commitlint (lowercase subject start). lefthook
  runs typecheck + build + verify on every commit — never bypass with `--no-verify`.
- No `Co-Authored-By` lines.
- **Sanitize every committed fixture**: no real usernames / passkeys / torrent or
  user IDs / external hosts / encoder watermarks / real image hashes. Genericize
  to DemoUser, 999999, `gNN`, stub slow.pics keys.

## Where we left off (recent + open)

Recent:
- **dev.17** — 057 multi-section parent title (a `FRA | USA | GBR` `<strong>`
  sitting in the parent before a `<pre>` of sub-sectioned shots); `~` separator.
- **dev.18** — indivisible comparison-thread OP shows the grid anyway.
- **dev.19** — drop-odd-shot thumbnail **picker** (`orphan-select.ts`) for
  indivisible OPs; 1-wide **"Show viewer" gallery** for ambiguous torrent sample
  shots (a leading title carrying a URL is a slow.pics caption, not a column
  heading — `Grid.gallery`).

Open:
- Picker thumbnails are the small `t.hdbits.org` thumbs; for near-identical
  frames a "click-to-peek-fullsize" variant would help (deferred).
- The gallery/reliability rule keys on a URL in the title line — precise but
  narrow. Other torrent false-positive shapes (no URL) aren't covered; collect
  examples before widening. NB: a `fromBlock`-alone signal over-reaches (it
  suppressed legit quote-adjacent comparisons 1009/1766 in an early sweep — we
  reverted to URL-only).
- UNVERIFIED.md items still need a real browser / tester.
