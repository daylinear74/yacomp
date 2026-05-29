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

## Resolved (for reference)
- 0623 single-source replenish → intentionally 0 grids (ruled: ignore).
- 015 / 064 → upgraded to correct multi-grid output.
- 0835 → one transposed N-column grid (case 084).
