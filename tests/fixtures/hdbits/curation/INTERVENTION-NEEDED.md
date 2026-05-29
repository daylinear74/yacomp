# Needs human ruling (review tomorrow)

Running list of judgment calls the autonomous pass deliberately did NOT decide.
Each entry: the case(s), what the parser does now, and the open question.

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

### 5. Prose NOTE with mid-string URL
- `0478` (torrent.desc): `["NOTE: the SNTN torrent https://… is dead, that's why I did this new encode…","Source vs encode…"]`
First column is a prose NOTE sentence (mid-string URL not stripped — tidyName
only strips a TRAILING URL). Open question: reject leading prose NOTE lines.

## Resolved (for reference)
- 0623 single-source replenish → intentionally 0 grids (ruled: ignore).
- 015 / 064 → upgraded to correct multi-grid output.
- 0835 → one transposed N-column grid (case 084).
