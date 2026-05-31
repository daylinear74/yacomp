# Column-title extraction — user rulings (canonical examples)

Authoritative decisions from the project owner on specific corpus cases. Treat
these as the ground truth when reasoning about parser behaviour, and as the
worked examples for the heuristics they motivated. Case IDs are the numeric
prefix of the bootstrapped fixture filename (e.g. `1202` →
`1202-topic-70854-post-0-…`).

## TEST COVERAGE (every ruling is locked)
Unit = `tests/unit/hdbits-rulings.test.ts` (pure functions). E2e = an iconic
fixture in `tests/fixtures/hdbits/cases/` (full DOM through `setupHDBitsCore`).

| Ruling | Unit | E2e fixture |
|---|---|---|
| vs / vs. / v. / \| precedence | ✓ | 089 1202, 090 0478, 091 2022, 100 0288 |
| `vs` with a missing space (AvsB / Avs B / A vsB) | ✓ | — |
| `>>>` / `>>` (better-than) is a separator | ✓ | 109 79242 |
| `~` (spaced tilde) separator, BELOW `/` precedence | ✓ | 111 78043 |
| leading comparison title in PARENT, before container | — | 057 |
| indivisible comparison-thread OP → drop-odd-shot picker | — | 113 80402 |
| quote/URL-sourced title is unreliable; torrent gallery → 1-wide viewer | — | 114 838405 |
| per-source labels before showhide/BDInfo blocks | — | 105 77086, 107 80662 |
| dangling `\|` after a dropped URL stripped | — | 108 79784 |
| OP H1 preferred over slow.pics when it divides | — | 110 80433 |
| strip `Video:`/`Audio:`/`Subtitle:` prefix | ✓ | 095 2221, 096 2425 |
| top-level split masks separators in (…) | ✓ | 087, 088 |
| asymmetric movie-title strip (+ negatives) | ✓ | 103 2902 |
| mediainfo / metric guard (looksLikeNames) | ✓ | 086 |
| prose guard (sentence + comma-prose) | ✓ | 093 2007, 098 3040 |
| footer label incl. "Slow.pics" (dot) | ✓ | 007, 094 2503 |
| explicit vs/\| ≠ comma/dash | ✓ | — |
| FlagCounter sig image excluded | — | 092 2927 |
| label divisibility / OP-H1 fall-through | — | 097 1261, 104 2625 |
| H1 title only for the OP, not replies | — | 101 OP / 102 reply |
| single slow.pics link defers to local title | — | 094 2503, 099 2751 |
| local per-group labels > adjacent slow.pics | — | 088 |
| slow.pics rescue for label-less blocks (A1) | — | 087 |
| image-less showhide ignored; per-source labels | — | 105 77086 |
| "Show comparison" link after the whole title | — | 106 74778 |
| row-index labels ignored (real title wins) | — | 060 2277 |

## META-RULES (canonical)
1. **`vs` / `vs.` / `v.` / `|` take precedence over ALL other separators** when
   extracting comparison titles. A slash, comma, dash or `×` never outranks a
   real per-group/heading label (they appear in BDInfo codec lines, byte counts,
   aspect ratios and prose). A prose paragraph that merely *mentions* "X vs. Y:
   …" is NOT a title (guarded by `looksLikeProse`).
2. **H1 / topic-title extraction applies ONLY to the original poster (first
   post)**, never to replies. A reply infers titles from its own body text only;
   if it has none, fall back to defaults (`Source 1..N`, or
   `Source / Filtered / Encode` for 3 columns). DONE — `isOriginalPost` gates
   `namesFromHeadings`; tested via the `forum.reply` fixture slot (cases 101 OP /
   102 reply). NOTE: real multi-post pages aren't fully reproduced by the
   synthetic 2-post fixture — see UNVERIFIED.md.

## Rule A — explicit-comparison line wins (IMPLEMENTED)
A leading line that carries an **explicit** comparison separator
(`vs` / `vs.` / `|` / `/` / `×`) is the authoritative column-title source. It
takes precedence over:
- per-group **comma** labels and prose,
- `NOTE:` / `nb:` preamble (a *nota bene* aside is **not** the titles),

…even when the source names are **hyperlinks** or wrapped in nested inline tags
(`<strong><font><div>…`). Comma/dash-only lines do **not** qualify (a comma/dash
routinely lives inside one source name). Implemented as
`leadingComparisonNames()` in `src/grid/parser.ts`, run at highest precedence.

| Case | Was (wrong) | Ruling (correct) |
|---|---|---|
| `1202` | `["nb JP & KR share…", "UK & FR…"]` | `JP (Pony Canyon) AVC @ 39Mb/s` / `UK (Anime Ltd) AVC @ 38Mb/s` |
| `0478` (torrent, wagner-parsifal) | `["NOTE: the SNTN torrent … is dead…", "Source vs encode"]` | `Source` / `encode` |

## Rule C — exclude signature/tracker images (IMPLEMENTED)
A FlagCounter (or similar) banner embedded in a post sig / hidden block is NOT a
screenshot. Counting it as a grid cell breaks the column-count divisibility of an
otherwise-clean grid. `isNonScreenshotImg()` excludes `flagcounter.com` images
from `collectGroups`.

| Case | Was (wrong) | Ruling (correct) |
|---|---|---|
| `2927` (solyaris) | 0 grids (60 screenshots + 1 FlagCounter = 61, indivisible) | `GER(Filmjuwelen)` / `FRA(Potemkine)` / `NLD(Lumiére)` / `RUS(Close-up)` / `USA(Criterion)` — **plain DOM heading, NO slow.pics needed** |
| `1167` (terminator-2) | real grid failed (8 screenshots + 1 FlagCounter = 9) | real `35mm Rob's nostalgia` / `35mm Calibrated` grid now renders (a stray bogus quote-block grid still remains — see Open) |

## Rule B — adjacent slow.pics is authoritative (IMPLEMENTED via rescue path)
When a comparison sits next to a `slow.pics/c/<key>` link, follow that link's
column **count** for sizing and its **titles** (unless a descriptive HDBits
heading matches the count — see A1 / `headingNamesBeforeLink`).

| Case | Note |
|---|---|
| `2625` (chatroom GBR/GER/GBR) | Has BDInfo quotes + a flat image block; uploader links `slow.pics/c/JzIoRiDD`. Per owner: follow that link's count + titles. Raw `getGrids` → 0 is expected; the slow.pics rescue link shapes it in-browser. |

## Open / pending
- `1167` (terminator-2 post-19): real label `35mm Rob's nostalgia vs 35mm
  Calibrated`, but the fixture's images come inside a quoted block (`RDPlissken
  wrote:`) whose prose is mis-read as names, AND the real comparison has an odd
  image count (9) that fails reshape. No slow.pics link. NOTE: owner's
  "BD vs UHD" description refers to a *different post* in the same topic (70641).
  Deprioritised; needs a quoted-block-exclusion rule + odd-trailing-image
  tolerance.
- `0110` = **torrent `cool-as-ice`** (`0110-torrent-694603-…`), not the
  v-for-vendetta forum post. It is all "Sources"/"Notes" preamble prose and
  currently yields 0 grids. Awaiting ruling on the intended comparison.
## Phase 2 rulings

### `v.` separator + footnote markers (DONE — `v.` added to VS_RE/VS_TEST)
- `0288` → `720p WEB-DL*` / `1080p WEB-DL` / `Capture` ✅
- `0319` → `CtrlHD¹` / `lulz¹` / `720p WEB-DL²` / `1080p WEB-DL³` (corpus body uses a different label line; partial)
- `2819` → `Warner Bros. Blu-ray (2024)` / `MA 4K WEB-DL (Resize)` (keep "(Resize)")
- `2814` → `MA 4K WEB-DL (Resize)` / `CEE BD (2024)`
- `1720` → TWO groups (multi-section; TODO)

### Strip `Video:` / `Audio:` / `Subtitle:` field prefixes (DONE — FIELD_PREFIX_RE)
- `2221` → TWO groups GER/USA video + GER/USA audio ✅
- `2425` → `GER (16,885 kbps)` / `FRA (20,007 kbps)` / `USA (26,900 kbps)` ✅

### Movie-title prefix / typos
- `2902` → `GBR` / `USA` (strip leading "Betty 1992 1080p Remux") — **DONE**
  (`stripAsymmetricTitle`, iconic fixture 103). Strip a shared "Title YEAR …"
  prefix only when ASYMMETRIC (some columns have it, others don't), trimming each
  titled column to the trailing tokens that parallel the short untitled column —
  accepted ONLY when every trimmed token is a simple code of the SAME shape as
  the reference (both pure-alpha region codes, or both digit-bearing format
  codes). The shape guard fixes the earlier reverted attempt: long madVR names
  whose terse "1080p BD" column faked asymmetry are kept (trailing "…(113)" has
  parens → rejected). Applied in BOTH `splitNames` and `namesFromHeadings`.
  Sweep: +10 name improvements, 0 regressions. One borderline result (0167 trims
  to a codec tail "H.264 DD5.1") — imperfect but not broken.
- `1313` → keep full long names; `vsPhantom` typo handled in splitNames ✅ (corpus body picks a shorter label line; partial)
- `1261` → `2160p UHD` / `1080p BD` ✅
- `1293` → a **reply**: ignore the topic title (needs H1-only-for-OP) — TODO

### Numeric / row-number labels
- `0640` → `A` / `B` / `C` (intentional — keep)
- `2277` → `ESP Blu-ray (17.4 Mbps AVC)` / `ITA Blu-ray (35 Mbps AVC)` (2 col); the `1 2 3 … A B … H` are ROW indices — ignore them

### H1-only-for-OP worked example
Topic `Winged Creatures (2008) GER vs FRA vs ESP` (forumid 40). The OP (Game0ver75)
has `GER:` / `FRA:` / `ESP:` per-group labels → 3 col. The reply "German audio is
obviously the best one" must NOT inherit the H1 title.

## Phase 3 rulings (separator precedence + multi-section)

### `>>>` / `>>` (better-than) separator — DONE (ARROW_RE, iconic 109)
- `79242` → `Eureka Classics` / `Cargo Records`. Two-or-more angle brackets are a
  comparison divider ("A is better than B"). A single `>` is left alone (it lives
  in prose / breadcrumb "Comparisons > …"); a one-sided decorative run (`BD >>>>>`)
  yields one part.

### `~` (spaced tilde) separator — DONE (TILDE_RE, iconic 111)
- `78043` → `AMAZON` / `FRA BD`. A spaced `~` ("AMAZON ~ FRA BD") is a divider.
- PRECEDENCE: `~` is the LOWEST real separator — below `,` `-` `/`. When a
  stronger separator already splits the line, the `~` is a sub-connector, NOT a
  split: `2241` "GBR ~ BFI (…) / USA ~ CC (…)" splits on `/` into two
  "REGION ~ distributor" sources (a tilde-high precedence wrongly made it 3
  parts and also broke the exotica `0049`/`0050` torrent grids — both fixed by
  the reorder). A bare `~5GB` size approximation is left alone (no spaces).

### Multi-section post: title in the PARENT, before the container — DONE (057)
`Cosmos (2015) FRA vs. US vs. GBR` (forumid 40). The main video comparison is a
`<strong>FRA | USA | GBR</strong>` sitting in the parent `<div>`, immediately
before a `<pre>` whose 63 screenshots are grouped by SUB-SECTION dividers
("Video Bitrate", "General", "Luma Artifacts", "Chroma Artifacts"). The grid
container is the `<pre>`, so the column title is not one of its own children —
`leadingComparisonNamesBeforeContainer` reads the single introductory line
directly before the container (back to the first blank line / previous block /
previous image block) and takes its `vs`/`|` names → `FRA / USA / GBR`, 63 / 3 =
21 rows; the sub-section labels are row-group dividers, not columns. Scoped to
that one line so a sibling grid's title can never leak across. (The 6-wide audio
downmix `USA_2 | GBR_6_2_…` is a separate section-c comparison.)

### Comparison-thread OP, indivisible count → show it anyway (80402)
`Berserk (1967) AUS vs GBR` (forumid 40). The OP posted 37 screenshots for a
2-wide AUS/GBR set — it should be 38, but the poster dropped one, so the count is
prime and no clean grid exists. Owner ruling: for an OP in a comparison thread,
always offer the "Show comparison" button anyway so the viewer can look. The
title comes from the H1 (the body has only a "Slowpics:" link, no inline label).
`cmpThreadLargestBlock` emits a PARTIAL grid (`grid.partial`) instead of
suppressing. Because the dropped shot can be ANYWHERE (a middle drop shifts every
pair after it), clicking "Show comparison" opens a thumbnail PICKER
(`openOrphanSelect`) laid out in the column count: the user clicks the odd
shot(s) to drop — with a live "N shots ÷ C ✓ / drop K more" hint — and Enter /
"Build comparison" re-flows the kept shots into a clean comparison. Gated to the
comparison-thread OP + slow.pics + single-contiguous-block shape, so a
multi-section OP with no slow.pics link (057's leftover blocks) stays suppressed,
and the divisible spoiler case (80070) keeps its clean-divide requirement. The
grid claims the shots, so the slow.pics rescue does not add a second button.

### Ambiguous torrent gallery → 1-wide "Show viewer", not bogus columns (838405)
`The White Dove AKA Holubice` (torrent 838405). The description ends with 10
sample screenshots of the encode — a single-source GALLERY, not an A/B
comparison; the two real comparisons are behind slow.pics links. The parser used
to invent a 5-column grid by folding the whole quote `<table>` (the "SOURCE:"
line plus the two slow.pics captions "…vs WEB-DL" / "Source vs Filtered vs Encode
vs WEB-DL") into one line and splitting it on "vs". Owner ruling (false viewer >
missing one): a title scraped from a quote/data block (`<table>`/`<pre>`/
`<blockquote>`) or carrying a URL is UNRELIABLE and must not title columns; on a
torrent page, a single flat image group whose only title was that blob falls back
to a 1-wide gallery (`Grid.gallery`, trigger reads "Show viewer"). Scoped so it
only fires where a bogus grid would otherwise have formed — quiet untitled blocks
stay quiet, and real Source/Encode / per-source comparisons (clean titles) are
untouched. A clean title with an indivisible count still becomes a partial grid
(80402), not a gallery.
