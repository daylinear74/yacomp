# Handling `needs-review` cases

This is the standing backlog for the HDBits fixture-curation pipeline. Read
this before touching the `needs-review` clusters in `progress.json`.

## What `needs-review` means

A `needs-review` cluster is one where **the parser DID detect a comparison
grid, but the source names it extracted tripped the pollution heuristic**
(`polluted()` in `03-select.ts` / `04-generate.ts`). These were deliberately
*not* turned into cases, because locking a messy name as `expected_names`
would bake a bad assertion into the suite.

## Status update — 2026-05-29 (backlog largely adjudicated)

The old "1,173 polluted / needs-review" framing is **superseded**. The column-title
semantics for those files were decided by explicit project rulings, and the
parser was fixed to match. `polluted()` is now only a *display* heuristic — it no
longer equals "uncovered", because a flagged name may be the agreed-correct
verbatim label.

Rulings now baked into `src/grid/names.ts` / `parser.ts`:

- **(A) metadata verbatim** — `@ 28.6 Mbps`, `kbps`, `@30Mb/s` etc. are kept as-is.
- **(B) size-fold** — a trailing/standalone file size is folded into the
  preceding source name (`… x264 (2.46 GB)`), not treated as its own column.
- **(C) tag-strip when text survives** — a leading `[thread-tag]` is removed only
  if text remains, so a fully-bracketed label like `[NOR 35036 kbps]` is kept
  verbatim.
- **(D) prose/commentary verbatim** — left exactly as written.
- `X wrote:` quote attributions and `Short/Long description:` field labels are
  **not** source labels (skipped).
- A single leading bold that itself carries a `vs`/`|` split is used as the
  comparison label (rescues posts where `description:` labels precede the real line).
- Frame-index spillover after a hard line break is trimmed.
- A single-source "replenish" reply with no `vs` is intentionally **not** surfaced.

Full sweep vs committed HEAD after these changes: grid-count **up 20 / down 70 /
→0 1 / same 3551**, **507** name-set changes — all classified as intended (size-fold
pseudo-grid collapses, `[tag]` strips, quote/description removals, frame-index
newline cuts, vs-line/bracket grid rescues); **zero unexplained regressions**; the
lone →0 is the intentionally-ignored single-source replenish. New representative
cases `081` (bracket-keep), `082` (description→vs-line), `083` (size-fold) lock the
previously-uncovered behaviors. See `progress.json#coverageVerification`.

---

The pollution heuristic (historical, for triage only) flags a name set if any name
is >45 chars, >7 words, or matches: bare 4-digit year, `kbps`, `GiB/MiB/KiB`, a URL,
a known image host, bbcode `[tag]`, a newline, a timecode `H:MM`, an `@mention`, a
leading `-`/`~`, or "video size".

## Two sub-categories — triage first

The backlog is **not** uniformly "parser bugs". Sampling shows it splits in
two, and they need opposite treatment:

### A. Genuine parser leaks → file/fix a parser bug

The parser pulled in something that is *not* a source name. Real examples:

| Extracted "name" | What it actually is | Status |
|---|---|---|
| `[Comparisons] Sully 2016 Blu-ray` | the **thread title** leaking in (bbcode + title) | **fixed** (ruling C / `stripTitlePrefix`) |
| `[Comparisons] A Nightmare on Elm Street (CAN` | thread title, truncated mid-paren | **fixed** (ruling C) |
| `2.46 GB`, `1.83 GB` | a **file-size column** misread as a source label | **fixed** (ruling B / size-fold) |

These were defects in `src/grid/names.ts` / `parser.ts`; the three above are now
fixed and locked (cases `083` size-fold; `081` bracket-keep; H1 tag-strip covered
by `stripTitlePrefix`). For any *new* category-A leak, the right action is the
same: reproduce with a minimal case, fix the parser so it returns the *correct*
names (or `null`), then lock that as a normal case.

### B. Legitimate names that merely contain noisy tokens → lock as-is

The name is a *correct* source descriptor that happens to include a bitrate or
size. The heuristic is just being conservative. Real examples:

```
"Amazon (7755 kbps)"      "GER (31966 kbps)"      "GER ( 31844 kbps )"
"UK (BFI) AVC @ 30Mb/s"   "DE (Koch Media) x264 @ 37Mb/s"
"Blu-ray VC-1 26780 kbps"
```

These are **not parser bugs** — that's genuinely how the uploader labelled the
column. The parser is behaving correctly. For these, either lock the name
verbatim, or (if you want canonical fixtures) lock a **grid-count-only** guard.

## Decision per cluster: pick one

For each `needs-review` cluster you choose to action:

1. **Grid-count-only guard** — create a case with `expected_grids: N` and **no
   `expected_names`** line. The e2e harness only asserts names when
   `expected_names` is present (see `tests/e2e/hdbits.spec.ts`, the
   `if (meta.expectedNames && meta.expectedGrids > 0)` branch), so this locks
   grid *detection* without asserting unreliable names. Best default for
   category B and for any "the grid count is what matters" case.
2. **Fix the parser** — for category A. Repro, fix `names.ts`/`parser.ts`,
   then lock correct `expected_names`.
3. **Skip / leave** — if the shape's clean behavior is already represented and
   the only novelty is the messy name, leave it in the backlog.

## How to action one (step by step)

Everything runs from the repo root with `bun`. Scratch artifacts from the last
sweep live in `.scratch/` (gitignored): `all-cands.json` (every dump body),
`all-out.json` (parser output per file: `{id, grids, names}`).

1. **List the polluted classes / pick targets.** Re-run the behavior-class
   analysis (the script used for the comprehensiveness audit) against
   `.scratch/all-cands.json` + `.scratch/all-out.json`; it prints each POL
   class with a count and an example file id. Or grep `progress.json` for
   `"status": "needs-review"`.
2. **Inspect the candidate.** Find its body in `.scratch/all-cands.json` by id.
   Decide category A vs B from the extracted names in `all-out.json`.
3. **Sanitize the body** with `05-sanitize.ts <file>` (idempotent: genericizes
   `t/i/img.hdbits.org` hashes → `g01…`, neutralizes external imgs/links/bare
   text URLs → `example.invalid`, scrubs `@mentions`/ids/passkeys). **Watch for
   URLs leaked in link _text_, not just `href`** — `05-sanitize.ts` handles
   these; the inline sanitizer in `04-generate.ts` does **not**.
4. **Get ground-truth names** by running the real viewer-driving oracle on the
   sanitized body: `oracle.ts <cands.json> <out.json>`. Use *this* (not the
   fast `getGrids()` oracle) for `expected_names`, because e2e reads names off
   the viewer label `._scf_comp_label span`, which is what `oracle.ts` reads.
5. **Write the case** under `cases/NNN-<slot>-<strategy>-<hint>.html` with the
   metadata header (`slot`, `expected_grids`, optional `expected_names`,
   `thread_title`/`torrent_title`, `notes`). Mirror the header format produced
   by `04-generate.ts`.
6. **Verify**: `npx playwright test tests/e2e/hdbits.spec.ts -g "NNN"`, then run
   the full file once. Re-scan the new case for leaked hashes/hosts/PII.
7. **Record it** in `progress.json` (bump `emittedCases`; note the source file
   under a `gapCases`-style entry if it's an intra-cluster behavioral variant
   the per-cluster model can't represent).

## Known parser observation (not a name bug)

A real ~5,000-thumbnail HDBits page (e.g. the `doctor-who-s05-s13` dump file,
~464 KB) takes ~7s of **synchronous** `getGrids()` to parse — enough to briefly
freeze the tab in the live userscript. Parsing is roughly linear in thumbnail
count; this is a performance edge, separate from the name-quality backlog.
