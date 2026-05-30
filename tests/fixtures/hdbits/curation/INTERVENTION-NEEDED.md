# Needs human ruling (review tomorrow)

Running list of judgment calls the autonomous pass deliberately did NOT decide.
Each entry: the case(s), what the parser does now, and the open question.

## Overnight session summary

Landed (all committed on `test/hdbits-fixture-curation`, 86 e2e + 189 unit green,
`bun run check` clean each commit):
- per-source-group transpose (0835) + narrow explicit-vs/|// multi-comp guard
- footer-label skip (See also/Slowpics/Note/Quote/Hidden text/Spoiler), bare-URL
  column drop, trailing-URL / trailing-colon / BBCode strip, decorative arrow strip
- `tidyName` centralizes the above across ALL name strategies
- "Movie Title (YYYY) - " prefix stripped from the first source
- all-numeric name sets (frame indices) → no labels
- leadingVsLabelInfo matches font/span-wrapped vs-labels
- cases locked: 084 (per-source-groups), 085 (url-strip); upgraded 015, 021, 064

Net vs shipped baseline: ~+110 grid rescues, ~700 name improvements, name-quality
residuals (colon/url/bbcode/newline) ≈ 0.

Tried & reverted (don't retry blindly): blanket paren-aware comma split (§4);
"Screens" footer word (exposed NFO-block junk in torrent.desc).

Everything below needs a ruling or a careful (risky) detector — left for you.

## Open

### 1. `2625` — "strong vs strong vs strong" → currently 0 grids (regression)
Body: `<strong>GBR Blu-ray (Gamma bug corrected)</strong> vs <strong>GER Blu-ray</strong> vs <strong>GBR Blu-ray</strong>` (three separate bolds joined by " vs " text), followed by a `<p class="sub"><b>Quote</b></p>` BDInfo block.
- HEAD showed `["Slowpics:","Note:","GBR Blu-ray (Gamma bug corrected)","GER Blu-ray","GBR Blu-ray"]` (real names + footer noise).
- Now 0 grids: footer noise correctly dropped, but the 3 real bolds aren't recombined into a vs-label and the `<b>Quote</b>` BDInfo bold pollutes the bold collection.
- Question: should "bold vs bold vs bold" (separate bolds joined by vs text) be recombined into one comparison label? And should `<b>Quote</b>`/BDInfo bolds inside quote blocks be excluded from name collection?

### 2. `0110` / `0120` — color-span comparison lost to preamble (regression)
torrent.description "Cool as Ice"; HEAD `["Source","MacP Turbine Encode","WATCHABLE","MacP Kino Encode","ABM WEB-DL Comparison"]`. Now 0 grids. Preamble has `<strong>Sources</strong>` / `<strong>Notes</strong>` + external blu-ray.com links.
- Question: confirm desired names, and whether the external-link / preamble handling should be relaxed for color-span comparisons.

### 3. Prose-as-names — grids labelled with sentence fragments
Some grids extract commentary prose as the source names, e.g.
- `1167`: `["35mm grindhouse scan is in the wild already","so all waxed out teal crap can go spit"]`
- `1900`: `["Here's some of the shots with madVR latest beta","disabled HSTM because my settings were reset."]`
- `1202`: `["nb JP & KR share the same encode","UK & FR are the exact same disc."]`
- `2326`: `["Audio is certainly better on ROKU","but can't decide about video..."]`
Earlier ruling D was "prose verbatim", so these are currently kept as-is. Open
question: should a grid whose names are clearly prose (no real source labels
present) instead fall back to a generic label or 0 grids? Needs a ruling — a
rough scan flags on the order of a few dozen such grids (the heuristic also
catches many *legitimate* long release names, so the true count is lower).

### 4. AviSynth / resize-note false grids
A processing note gets split on a comma into bogus columns:
- `0288` / `0282`: `["*Spline36Resize(1920","1080)"]`
- `1807`: `["* 4k webrip resized to (1920","804)"]`
These are not comparisons (single source + a resize script line). Open question:
detect and reject function-call/script lines as grid labels?
**Tried & rejected:** a paren-aware comma split (don't split commas inside
`()`/`[]`) fixes these 3 but REGRESSES 10 real comparisons whose source list is
enclosed in parens, e.g. `E01 (DE 18Mb/s, ES 18Mb/s, FR 20Mb/s, UK 27Mb/s,
US 25Mb/s)` (case 2026). So a smarter detector is needed (e.g. only reject when a
part has an unbalanced `(` AND the next part the matching `)` AND the inner text
looks like function args), not a blanket paren-aware split.

### 5. Prose NOTE with mid-string URL
- `0478` (torrent.desc): `["NOTE: the SNTN torrent https://… is dead, that's why I did this new encode…","Source vs encode…"]`
First column is a prose NOTE sentence (mid-string URL not stripped — tidyName
only strips a TRAILING URL). Open question: reject leading prose NOTE lines.

### 6. Movie-title prefix leaks into the first column (non-H1 labels)
When the comparison label is leading text / a bold like
`Blue City (1986) - USA (Vinegar Syndrome) vs USA (Olive Films)` or
`Let's Dance (no year) FRA vs GER`, the title prefix ends up on the FIRST source:
- `3077`: `["Blue City (1986) - USA (Vinegar Syndrome)", "USA (Olive Films)"]`
- `2690`: `["Let's Dance (no year) FRA", "GER"]` (viewer order)
`stripTitlePrefix` already strips a leading "Title (year) - " / "Title - " but is
only applied to H1 headings (`namesFromHeadings`), not to leading-text / bold /
structured labels. Open question: apply title-prefix stripping to the first split
part of those labels too? Risk: a legitimate first source containing
"(year) - "/" - " could be over-stripped — needs a ruling + careful sweep.
(Common pattern — this is the main reason a couple of footer/url cases couldn't be
locked as clean fixtures.)

### 7. Field-label prefixes on columns (`Video:` / `Audio:` / `Subtitle:`)
~22 names carry a metadata field prefix:
- `2221`: `["Video: GER (1080p AVC 19999 kbps...)", "USA (...)"]` then a 2nd grid `["Audio: GER (...)", "USA (...)"]`
- `0436`/`2061`/`1527`: `"Subtitle: English"` / `"Subtitle: German"` / `"Subtitle: French"` as columns
Open question: strip a leading `Video:`/`Audio:` field prefix from the first
column (like the title-prefix fix)? And are `Subtitle:`-labelled grids real
screenshot comparisons at all, or metadata tables that should be 0 grids?

### 8. Numeric-only / single-char column names (likely frame indices)
~53 numeric-only names (`"2"`,`"3"`,`"11"`…) and ~41 single-char (`"A"`,`"B"`,`"C"`).
- `1161`: names are bare frame numbers (2,3,6,7,8,…) — frame indices mis-read as sources.
- `0640`: `["A","B","C"]` — could be legitimate short source letters OR generic.
There is already `allNumeric` group-label skipping; these slip through via another
path. Open question: reject all-numeric / all-single-char name sets (risk: a few
posts genuinely label sources A/B/C)?

### 9. `2927` — quote-footer skip broke a real 5-source grid (regression, kept net-positive)
Adding `Quote`/`Hidden text`/`Spoiler` to the footer-skip rescued **22** grids
(e.g. AUS/GER, USA/GER/AUS) where a `<b>Quote</b>`/spoiler block had suppressed
detection — a big net win. But it regressed ONE case, `2927`
(`GER(Filmjuwelen) vs FRA(Potemkine) vs NLD(Lumiére) vs RUS(Close-up) vs
USA(Criterion)` → 0 grids). 2927 has 120 images + a trailing showhide block; the
`Quote` filtering interacts with showhide container selection in a way that's hard
to trace. Kept the change (+22 / −1). Open question: worth root-causing the
showhide+quote interaction to recover 2927?

### 10. Wedding-Banquet post — multi-section comparison inside one `<strong>`
A torrent.description with THREE comparison sections, all labels + the first two
sections' images wrapped in ONE big `<strong>`:
1. `Source (Carlotta | FRA), Geek, TayTO (TWN):` — **FIXED** (top-level split now
   yields `["Source (Carlotta | FRA)", "Geek", "TayTO (TWN)"]`; the inner `|` is
   no longer split).
3. `Source vs Geek (FRA) vs BMF (GER):` — already correct.
Fixed since:
- **Spurious 2-col grid** — DONE via `isMultiSourceLabel` (transpose path now
  skips a label that is itself a multi-source list); also rescued 13 grids.
- **3-col `Source/Filtered/Encode` default** — DONE (a 3-wide comparison with no
  usable source label defaults to Source/Filtered/Encode; cases 055/063 updated).

Still open:
- **Duplicate grid** from the nested `<strong>` inside `<td>`: `getGrids` parses
  BOTH the inner `<strong>` (group A+B images) and the outer `<td>` (all images),
  so the first comparison appears twice. **Tried & reverted:** climbing past
  inline wrappers (`blockContainer`) to make every image resolve to the same
  block — it deduped the wedding but BROKE 4 real comparisons (0887 US/EUR/HKG/NOR,
  1741 ITA/US/GER/GBR, 1736, 0470) by changing parse scope. Net-negative, reverted.
  A safer dedup (e.g. skip a container whose images are a subset of an
  already-parsed outer container, or per-image assignment tracking) is needed.
- **`Dirty line fix:` as its own grid**: group B's images currently merge into
  group A's grid. Making it a separate Source/Filtered/Encode grid needs
  `buildMultiCompGrids` to start a new section on a non-source NOTE label (not
  just a `vs` label). Risky (sectioning logic); needs a careful trigger + sweep.

## Resolved (for reference)
- 0623 single-source replenish → intentionally 0 grids (ruled: ignore).
- 015 / 064 → upgraded to correct multi-grid output.
- 0835 → one transposed N-column grid (case 084).
