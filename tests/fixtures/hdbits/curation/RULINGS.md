# Column-title extraction — user rulings (canonical examples)

Authoritative decisions from the project owner on specific corpus cases. Treat
these as the ground truth when reasoning about parser behaviour, and as the
worked examples for the heuristics they motivated. Case IDs are the numeric
prefix of the bootstrapped fixture filename (e.g. `1202` →
`1202-topic-70854-post-0-…`).

## META-RULES (canonical)
1. **`vs` / `vs.` / `v.` / `|` take precedence over ALL other separators** when
   extracting comparison titles. A slash, comma, dash or `×` never outranks a
   real per-group/heading label (they appear in BDInfo codec lines, byte counts,
   aspect ratios and prose). A prose paragraph that merely *mentions* "X vs. Y:
   …" is NOT a title (guarded by `looksLikeProse`).
2. **H1 / topic-title extraction applies ONLY to the original poster (first
   post)**, never to replies. A reply infers titles from its own body text only;
   if it has none, fall back to defaults (`Source 1..N`, or
   `Source / Filtered / Encode` for 3 columns). [TODO — not yet implemented]

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
## Phase 2 rulings (owner-confirmed, TODO)

### `v.` separator + footnote markers (these are REAL comparisons, not garbage)
- `0288` → `720p WEB-DL*` / `1080p WEB-DL` / `Capture` (3 col; ` v. ` separator, `*` footnote)
- `0319` → `CtrlHD¹` / `lulz¹` / `720p WEB-DL²` / `1080p WEB-DL³` (4 col; ` v. `, superscript footnotes)
- `2819` → `Warner Bros. Blu-ray (2024)` / `MA 4K WEB-DL (Resize)` (keep "(Resize)")
- `2814` → `MA 4K WEB-DL (Resize)` / `CEE BD (2024)`
- `1720` → TWO groups: (1) `Blu-ray 1080p (VexHD/FraMeSToR Remux)` / `Amazon 1080p`; (2) `Amazon 1080p` / `Netflix 1080p` / `Amazon 1080p (resized+addBorders)`

### Strip `Video:` / `Audio:` / `Subtitle:` field prefixes (just say the comparison kind)
- `2221` → TWO groups: (1) `GER (1080p AVC 19999 kbps 23.976 fps)` / `USA (…)`; (2) `GER (DTS-HD MA 5.1 3588 kbps 24-bit)` / `USA (…)`
- `2425` → groups split on `|`, prefix stripped: e.g. `GER (French 5.1ch DTS-HD MA @ 1934 kbps)` / `USA (…)`

### Movie-title prefix / typos
- `2902` → `GBR` / `USA` (strip leading "Betty 1992 1080p Remux")
- `1313` → keep the full long names; the bug is a missing space in `…(with NGU Sharp) vsPhantom Thread…` — handle `vs` immediately followed by a capital
- `1261` → `2160p UHD` / `1080p BD` (2 col)
- `1293` → a **reply**: ignore the topic title; 3 col, no body title → `Source 1/2/3` (or `Source/Filtered/Encode`)

### Numeric / row-number labels
- `0640` → `A` / `B` / `C` (intentional — keep)
- `2277` → `ESP Blu-ray (17.4 Mbps AVC)` / `ITA Blu-ray (35 Mbps AVC)` (2 col); the `1 2 3 … A B … H` are ROW indices — ignore them

### H1-only-for-OP worked example
Topic `Winged Creatures (2008) GER vs FRA vs ESP` (forumid 40). The OP (Game0ver75)
has `GER:` / `FRA:` / `ESP:` per-group labels → 3 col. The reply "German audio is
obviously the best one" must NOT inherit the H1 title.
