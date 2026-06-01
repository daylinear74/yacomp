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
