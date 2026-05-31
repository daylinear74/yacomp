# Things the test harness CANNOT verify

## Corpus examples to inspect on the LIVE site
(Visit `https://hdbits.org/forums/viewtopic?topicid=<id>`.)

**slow.pics-dependent (ONLY when no local label exists).** Having a slow.pics
link does NOT mean the comparison is slow.pics-dependent — if a local "X vs Y vs
Z" / per-source label is present, slow.pics must NOT be triggered (the label
sits between the link and the screenshots, so `hasLocalLabelBetween` keeps the
images out of the rescue). Owner-confirmed examples that are NOT slow.pics
dependent (clear local labels) and must shape from the DOM:
- topicid 78859 (Doctor Who — per-season showhides each labelled "GBR BD vs USA
  BD vs GER BD"; the 25 slow.pics links must NOT fire)
Genuinely slow.pics-dependent = a flat screenshot block with NO local label and
a slow.pics link (e.g. the 087 dirty-line-fix shape) — those need a LIVE fetch
to verify titles/counts; find them by a slow.pics link whose images have no
preceding source label.

**reply posts with screenshots (H1-only-for-OP).** Owner spot-checked these as
already correct: 62860 post#11 (winged-style ✓), 59424 post#14 (replenish, no
comparison ✓), 77086 post#7 (replenish ✓), 58805 post#2 ✓, 72847 post#2 ✓. The
single-post corpus still can't exercise the reply path in general; confirm on a
live multi-post thread that the topic H1 is not applied to a reply., 78200 post#2

---


These behaviours are exercised only partially (or not at all) by the unit/e2e
suite and the corpus sweep. They need a real Tampermonkey + live tracker page, or
tester judgment, to confirm. Tracked here so future work doesn't assume they're
covered.

## slow.pics integration
- **Real slow.pics fetch/parse — OWNER-VERIFIED WORKING (2026-05) on topicid
  80433.** The live network fetch, the `/redir.php?url=<base64>` decode, and the
  collection parse all work on a real page. (CI still uses the canned stub in
  `tests/fixtures/hdbits/test-entry.ts`, so the *parse of arbitrary real
  collections* is still only stub-tested — but the round-trip is confirmed.)
  Verification also surfaced cases that wrongly fell back to slow.pics when a
  better local source existed; those are now fixed (80662 per-source labels,
  79784 dangling `|`, 79242 `>>>`, 80433 OP-H1-over-slow.pics).
- **slow.pics performance.** Hover-prefetch, the GM_setValue persistent cache,
  and the ~1s fetch latency are only measurable in a real browser. The "Loading
  comparison…" state and cache hit-rate are unverified in CI.
- **DOM-label vs slow.pics-title quality.** A1 prefers a descriptive HDBits
  heading over the slow.pics title when counts match; whether that reads better
  in practice needs tester feedback.

## The getGrids() vs real-flow gap (IMPORTANT)
- The corpus **sweep only calls `getGrids()`** — it does NOT run
  `setupHDBitsCore`, so it does NOT see the slow.pics CLAIMING step. The "+N
  grids" sweep numbers are a getGrids upper bound: accurate for non-slowpics
  cases, but for slow.pics-adjacent ones the real userscript may behave
  differently. Only the **e2e** suite (which runs `setupHDBitsCore` + the
  slow.pics stub) reflects the real claiming order — but with the stubbed
  collection, not live.
- **Resolved for the known cases (2503/2751):** `setupHDBitsCore` now runs
  getGrids FIRST for single-slow.pics-link containers (local label wins) and only
  excludes/rescues containers with ≥2 slow.pics links (087 multi-section). But
  this means a SINGLE-link container in the wild where getGrids produces a wrong
  grid would claim the images instead of falling back to slow.pics — only the
  iconic e2e cases are covered, not every wild single-link shape.

## H1-only-for-OP (1293) — now partly testable
- Implemented (`isOriginalPost` gates `namesFromHeadings`) and tested via the
  new `forum.reply` slot (cases 101 OP / 102 reply). BUT the `forum.reply` slot
  renders a SYNTHETIC two-post thread (an OP placeholder + the body as #2); real
  HDBits thread markup (nested `readpost` tables, multiple replies, edits) is not
  reproduced. `isOriginalPost` keys off "the first `td.comment`" — if real pages
  use a different post container, OP detection could misfire. Confirm on a live
  multi-post comparison thread.
- The corpus SWEEP still renders every case as a single post, so it cannot
  exercise the reply path at all.

## Tampermonkey / GM_* runtime
- `GM_xmlhttpRequest` cross-origin fetch, `GM_setValue`/`GM_getValue`
  persistence, `@connect slow.pics`, and the `v*` tag → auto-update flow are
  validated only by the release pipeline + manual install, not by CI.
