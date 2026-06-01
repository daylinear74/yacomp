# Column-title extraction — the model

A small set of load-bearing rules meant to cover the scenarios in `RULINGS.md`
**without overfitting**. `RULINGS.md` is the case-by-case ground truth; this is
the unifying spec the parser should implement and be graded against.

## Detect per image-block, in one of three contexts

Detection runs **per image-block** (a contiguous region of screenshots). Context
decides whether the H1 has authority:

- **OP** (first post of a comparison thread) — has H1 authority.
- **Reply** (later post) — no H1; its own body only.
- **Torrent** (description/comment) — no H1; its own body only.

Replies and torrents behave identically (body-only). Multi-section posts (057)
are not special — they are just "run per-block."

## Collect every candidate title (no short-circuit)

For each block, gather all candidates, then select:

1. **Per-group labels** — when the block's image groups are each labelled
   (transpose: N labels = N columns).
2. **Adjacent lines** — the short title-like text immediately before the grid,
   in the container *and* in the parent before the container, nearest-first,
   **skipping documentation blocks** (`<table>` / `<pre>` / quote).
3. **H1** — OP only. The standard "A vs B vs C" topic title.

## `isTitleParagraph` — one predicate replaces the scattered guards

A candidate is a valid title only if it is:

- **short** (a label, not a paragraph);
- splits into names that `looksLikeNames` (region / source / format names or
  bitrates — **not** years, runtimes, prose, or pure row-indices `1. 2. 3.`);
- not prose (`looksLikeProse`);
- **not sourced from a doc block** (`<table>`/`<pre>`/quote) and **carries no
  URL** (a URL-bearing line is a slow.pics caption, not a heading — Holubice);
- not a section word (`Preview:`, `See also`, `Screenshots`, `Slowpics:`).

## Splitting a title into columns (orthogonal, unchanged)

`splitNames`, separator precedence `|` > `vs`/`v.` > `>>>` > `,` > `-` > `/` >
`~` > `×`, paren-masked. Title cleanup (strip an asymmetric `Movie YEAR …`
prefix, strip `Video:`/`Audio:` field prefixes) applies afterward. These are not
part of the title-*source* rules.

## Select the column count + names

1. If a **strong adjacent comparison title** exists (explicit separator, passes
   `isTitleParagraph`) → it **owns** the column count for the block. Among
   competing *adjacent* candidates, more columns wins.
2. Else, for an **OP** → the **H1** (the safe, standard default).
3. **H1 is the safe default**: a *present-but-weak/ambiguous* adjacent line (no
   clear separator, could be a sub-note) does **not** override a clean H1. The
   adjacent only wins when it's unambiguously a stronger comparison title — e.g.
   it lists **more** sources than the H1 (more complete), or it **fits** the
   block when the H1 doesn't. When in doubt → H1.
4. Reply / torrent with no adjacent title → no DOM title.

## Divisibility decides PRESENTATION, not selection

The column count chosen above is **final**. Divisibility only chooses how to show
it:

- `image_count % cols == 0` → clean grid.
- otherwise → a missing/extra shot → open the **existing drop-odd-shot picker**
  at that column count. The user drops the odd shot(s); we do **not** try to
  detect which slot is missing (unknowable, and rare — no special logic).

**A coincidental clean divide of a weaker candidate never changes the column
count.** The anchor case: a 5-wide comparison with one missing shot —
`5×7 + 4 = 39` — must stay 5-col + picker even though `39 % 3 == 0` would let a
3-col H1 "divide cleanly". Selection first, divisibility second.

## Is it a comparison at all?

- A valid title (strong adjacent / H1 / per-group) → grid.
- A comparison-like candidate that was **filtered** (URL / prose / doc-block) and
  no valid title remains → **gallery** (torrent: 1-wide "Show viewer").
- No comparison-like candidate at all → **suppress** (false-positive guard).

## slow.pics — demoted

Only ~1% of the corpus is "slow.pics link + no local `vs/|` + no `vs/|` H1", and
that overcounts (several have per-group labels). So slow.pics is **not** a
primary title path. It is:

- a "this **is** a comparison" signal (helps comparison-vs-gallery), and
- a last-resort count/title source **only** when no local candidate exists.

The enrichment/rescue machinery in `setupHDBitsCore` should shrink to match that
~1% reality.

## Fallback ladder (summary)

```
strong adjacent title
  → H1 (OP only)
  → per-group labels
  → comparison-like candidate filtered? → gallery (torrent)
  → else → suppress
titled but indivisible → drop-odd-shot picker at the chosen column count
```

---

# Implementation progress & how to continue

This spec is being implemented as an **incremental refactor** of the existing
parser (NOT a rewrite), each step gated by the corpus sweep against the faithful
baseline (`.scratch/_baseline.json`). **Ship gate per step: 0 losses** (excluding
`grids<0` flakiness) — but a LOSS that removes a genuine false positive
(prose / quote / file-list) is a *win*; eyeball each one.

## Done

- **Step 1 — spec.** This file.
- **Step 2 — faithful sweep harness.** `fast-oracle` now renders a forum case
  whose id is `post-N` (N>0) as a **reply** (an OP placeholder above it), so
  `isOriginalPost` is false and the H1-only-for-OP rule is graded honestly across
  the corpus's **732 replies**. Baseline re-cut on this harness: 29 replies
  correctly stopped borrowing the topic H1, 0 real regressions. (`fast-oracle`
  and the baseline are gitignored — they live in the handoff zip.)
- **Step 3a (partial) — the `asColumnTitles` predicate.** In `src/grid/names.ts`:
  `looksLikeProse` moved here (re-exported from parser.ts so any strategy can
  guard with it); `asColumnTitles(text)` is THE column-title predicate — **no
  length cap** (a 6-col title runs long, 2245), `isNonSourceLabel` + **whole-line
  prose** (with the `v.`/`vs.` separator masked so 0288 footnotes survive) +
  explicit separator + `looksLikeNames` + per-part prose; `isQuoteAttribution`
  also catches a leading `User wrote:` (1009). `nameLabelInfoFromBoldTags` routes
  through it → the **1009** quote FP is gone, 0 regressions (commit `4f2c517`).

## Next (in order)

- **3a-continued — route the remaining candidate producers through
  `asColumnTitles`.** Bold-tags are done; still un-routed: `leadingComparisonNames`
  (parser.ts), the `findComparisonNames` sub-scanners (`namesFromLeadingText`,
  `namesFromSiblings`, color-spans), and the per-group-label path. Routing these
  fixes the remaining known FPs — **0117** (comma-prose "For some reason, D+ added
  black bars…") and **0049/0050** (exotica torrent *file-lists*, not comparisons)
  — and is where the scattered guards finally collapse to one call site. Do it
  **one producer at a time, sweep after each**: a careless routing nicks a ruling
  (2245's long 6-col title and 0288's `v.` footnotes were both near-misses in 3a).
- **3b — per-block collect→select.** Replace the precedence ladder in `parseGrid`
  with: collect all candidates (per-group labels · adjacent lines skipping doc
  blocks · H1 if OP) → `asColumnTitles` each → select (strong adjacent owns the
  count; H1 the safe default; more-cols breaks *adjacent* ties; divisibility
  decides clean-grid vs picker, NOT the count). Multi-section (057), the
  parent-title case, and `cmpThreadLargestBlock` should fall out of this and
  become deletable.
- **3c — demote slow.pics.** Shrink the enrichment/rescue in `setupHDBitsCore` to
  a "this is a comparison" signal + a last-resort title/count source for the ~1%
  of cases with no local candidate.

## Validate a step

```sh
rm -f tests/fixtures/hdbits/curation/.scratch/new-out.json
python3 tests/fixtures/hdbits/curation/.scratch/sweep-driver.py   # ~12 min
# diff new-out.json vs _baseline.json (the snippet is in HANDOFF.md → "The corpus sweep")
```

Also run `bun test tests/unit` and `bunx playwright test` (the unit + e2e gate the
rulings). Re-baseline (`cp new-out.json _baseline.json`) only after every delta is
reviewed and accepted.
