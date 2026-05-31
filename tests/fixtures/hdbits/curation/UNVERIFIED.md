# Things the test harness CANNOT verify

## Corpus examples to inspect on the LIVE site
(Visit `https://hdbits.org/forums/viewtopic?topicid=<id>`.)

**slow.pics-dependent (live titles/counts unverified — 64 cases with ≥2 slow.pics
links route through the rescue path):**
- topicid 78859 (Doctor Who — **25** slow.pics links, heavy multi-section)
- topicid 78578 (4 links), 78534 / 78526 (Marvel, 3 links each)
- topicid 80336 (Chatroom 2625 — now fixed via H1, but has 2 links)
- topicid 79320, 81472, 79498, 79068, 79848 (2 links each)

**reply posts with screenshots (H1-only-for-OP — 732 cases; the single-post
corpus can't exercise the reply path, confirm the topic H1 is NOT applied to a
reply that has a labelless grid):**
- topicid 74778 post#6, 62860 post#11, 59424 post#14, 77086 post#7,
  72182 post#6 (clear replies, deep in the thread)
- topicid 58805 post#2, 61913 post#2, 72847 post#2, 78200 post#2

---


These behaviours are exercised only partially (or not at all) by the unit/e2e
suite and the corpus sweep. They need a real Tampermonkey + live tracker page, or
tester judgment, to confirm. Tracked here so future work doesn't assume they're
covered.

## slow.pics integration
- **Real slow.pics fetch/parse.** e2e/sweep use a test stub (`tests/fixtures/
  hdbits/test-entry.ts`) that returns a canned 3-col `S/F/E` collection for ANY
  key. The real `extractCollection` against live slow.pics HTML, real column
  titles, real image counts, and the `/redir.php?url=<base64>` decode against
  real keys are NOT exercised offline. (Validated once manually via Chrome MCP on
  the live dirty-line-fix page; not in CI.)
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
