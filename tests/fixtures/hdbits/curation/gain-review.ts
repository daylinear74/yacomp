import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

export type ReviewStatus = "pending" | "correct" | "wrong" | "deferred";
export type ReviewKind = "gain" | "name" | "loss";
export type ReviewScope = "all" | "torrents" | "non-torrents";
export type GridNames = (string[] | null)[] | null;

export interface SweepRow {
  id: string;
  grids: number;
  names?: GridNames;
}

export interface GainReviewEntry {
  id: string;
  shortName: string;
  fileUri: string;
  originalUrl: string | null;
  exists: boolean;
  baselineGrids: number;
  newGrids: number;
  delta: number;
  baselineNames: GridNames;
  newNames: GridNames;
}

export interface GainMark {
  status: ReviewStatus;
  note: string;
  updatedAt: string;
}

export type GainMarks = Record<string, GainMark>;

export interface GainReviewSummary {
  generatedAt: string;
  counts: {
    total: number;
    correct: number;
    wrong: number;
    deferred: number;
    pending: number;
  };
  wrong: { id: string; note: string }[];
  deferred: { id: string; note: string }[];
  correct: { id: string; note: string }[];
  pending: { id: string; note: string }[];
}

interface BuildEntriesOptions {
  repoRoot: string;
  baselineRows: SweepRow[];
  newRows: SweepRow[];
}

interface WriteOptions {
  repoRoot?: string;
  scratchDir?: string;
  baselineFile?: string;
  newFile?: string;
  now?: string;
}

interface ReviewPayload {
  kind: ReviewKind;
  scope: ReviewScope;
  title: string;
  generatedAt: string;
  entries: GainReviewEntry[];
  marks: GainMarks;
  summary: GainReviewSummary;
}

const DEFAULT_SCRATCH = "tests/fixtures/hdbits/curation/.scratch";
const TORRENT_FIXTURE_PREFIX = "yacomp-torrents-fixtures-";
const REVIEW_FILES: Record<ReviewKind, {
  title: string;
  html: string;
  json: string;
  marks: string;
  summary: string;
}> = {
  gain: {
    title: "HDBits GAIN Review",
    html: "gain-review.html",
    json: "gain-review.json",
    marks: "gain-review-marks.json",
    summary: "gain-review-summary.json",
  },
  name: {
    title: "HDBits NAME Review",
    html: "name-review.html",
    json: "name-review.json",
    marks: "name-review-marks.json",
    summary: "name-review-summary.json",
  },
  loss: {
    title: "HDBits LOSS Review",
    html: "loss-review.html",
    json: "loss-review.json",
    marks: "loss-review-marks.json",
    summary: "loss-review-summary.json",
  },
};

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function rowMap(rows: SweepRow[]): Map<string, SweepRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

function normalizedStatus(status: unknown): ReviewStatus {
  return status === "wrong" || status === "deferred" || status === "pending" ? status : "correct";
}

function normalizedMark(mark: GainMark | undefined, now: string): GainMark {
  return {
    status: normalizedStatus(mark?.status),
    note: typeof mark?.note === "string" ? mark.note : "",
    updatedAt: typeof mark?.updatedAt === "string" ? mark.updatedAt : now,
  };
}

export function originalUrlFromCaseHtml(content: string): string | null {
  const header = content.match(/^<!--([\s\S]*?)-->/);
  if (!header) return null;
  const notes = header[1].match(/^notes:\s*(.+)$/im);
  if (!notes) return null;
  const url = notes[1].match(/\bscraped from\s+(https:\/\/hdbits\.org\/[^\s)]+)/i);
  return url ? url[1] : null;
}

function originalUrlForCase(path: string): string | null {
  if (!existsSync(path)) return null;
  return originalUrlFromCaseHtml(readFileSync(path, "utf-8"));
}

function namesChanged(previous: GridNames, next: GridNames): boolean {
  return JSON.stringify(previous ?? null) !== JSON.stringify(next ?? null);
}

function buildReviewEntries(
  options: BuildEntriesOptions,
  include: (previous: SweepRow, next: SweepRow) => boolean,
): GainReviewEntry[] {
  const baseline = rowMap(options.baselineRows);
  const entries: GainReviewEntry[] = [];

  for (const next of options.newRows) {
    const previous = baseline.get(next.id);
    if (!previous) continue;
    if (next.grids < 0 || previous.grids < 0) continue;
    if (!include(previous, next)) continue;

    const absPath = resolve(options.repoRoot, next.id);
    entries.push({
      id: next.id,
      shortName: basename(next.id),
      fileUri: pathToFileURL(absPath).href,
      originalUrl: originalUrlForCase(absPath),
      exists: existsSync(absPath),
      baselineGrids: previous.grids,
      newGrids: next.grids,
      delta: next.grids - previous.grids,
      baselineNames: previous.names ?? null,
      newNames: next.names ?? null,
    });
  }

  return entries.sort((a, b) =>
    a.baselineGrids - b.baselineGrids ||
    b.delta - a.delta ||
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}

export function buildGainReviewEntries(options: BuildEntriesOptions): GainReviewEntry[] {
  return buildReviewEntries(options, (previous, next) => next.grids > previous.grids);
}

export function buildNameReviewEntries(options: BuildEntriesOptions): GainReviewEntry[] {
  return buildReviewEntries(options, (previous, next) =>
    next.grids === previous.grids &&
    namesChanged(previous.names ?? null, next.names ?? null),
  );
}

export function buildLossReviewEntries(options: BuildEntriesOptions): GainReviewEntry[] {
  return buildReviewEntries(options, (previous, next) => next.grids < previous.grids);
}

export function isTorrentFixtureId(id: string): boolean {
  return id.startsWith(TORRENT_FIXTURE_PREFIX);
}

export function filterReviewEntriesByScope<T extends { id: string }>(entries: T[], scope: ReviewScope): T[] {
  if (scope === "torrents") return entries.filter((entry) => isTorrentFixtureId(entry.id));
  if (scope === "non-torrents") return entries.filter((entry) => !isTorrentFixtureId(entry.id));
  return entries;
}

export function mergeGainMarks(entries: { id: string }[], existing: GainMarks, now: string): GainMarks {
  const marks: GainMarks = {};
  for (const entry of entries) {
    marks[entry.id] = normalizedMark(existing[entry.id], now);
  }
  return marks;
}

export function summarizeGainReview(
  entries: { id: string }[],
  marks: GainMarks,
  now: string,
): GainReviewSummary {
  const summary: GainReviewSummary = {
    generatedAt: now,
    counts: {
      total: entries.length,
      correct: 0,
      wrong: 0,
      deferred: 0,
      pending: 0,
    },
    wrong: [],
    deferred: [],
    correct: [],
    pending: [],
  };

  for (const entry of entries) {
    const mark = normalizedMark(marks[entry.id], now);
    summary.counts[mark.status] += 1;
    summary[mark.status].push({ id: entry.id, note: mark.note });
  }

  return summary;
}

function readMarksFile(path: string): GainMarks {
  const raw = readJsonFile<unknown>(path, {});
  if (!raw || typeof raw !== "object") return {};
  if ("marks" in raw) {
    const marks = (raw as { marks?: unknown }).marks;
    return marks && typeof marks === "object" ? marks as GainMarks : {};
  }
  return raw as GainMarks;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function jsJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("</", "<\\/");
}

function scopedTitle(title: string, scope: ReviewScope): string {
  if (scope === "torrents") return `${title} (Torrents only)`;
  if (scope === "non-torrents") return `${title} (Non-torrents only)`;
  return title;
}

function scopedPayload(payload: ReviewPayload, scope: ReviewScope, now = payload.generatedAt): ReviewPayload {
  const entries = filterReviewEntriesByScope(payload.entries, scope);
  const marks = mergeGainMarks(entries, payload.marks, now);
  return {
    ...payload,
    scope,
    title: scopedTitle(REVIEW_FILES[payload.kind].title, scope),
    entries,
    marks,
    summary: summarizeGainReview(entries, marks, now),
  };
}

function renderGainReviewHtml(payload: ReviewPayload): string {
  const entriesJson = jsJson(payload.entries);
  const marksJson = jsJson(payload.marks);
  const summaryJson = jsJson(payload.summary);
  const kindJson = jsJson(payload.kind);
  const scopeJson = jsJson(payload.scope);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(payload.title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    header { position: sticky; top: 0; z-index: 10; padding: 16px 20px; border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent); background: color-mix(in srgb, Canvas 94%, transparent); backdrop-filter: blur(10px); }
    h1 { margin: 0 0 8px; font-size: 20px; }
    .sub { margin: 0 0 12px; color: color-mix(in srgb, CanvasText 68%, transparent); font-size: 13px; }
    .controls { display: grid; grid-template-columns: minmax(220px, 1fr) auto auto auto auto; gap: 10px; align-items: center; }
    input, select, button, textarea { font: inherit; }
    input, select { padding: 8px 10px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: 6px; background: Canvas; color: CanvasText; }
    button { border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: 6px; padding: 7px 10px; background: Canvas; color: CanvasText; cursor: pointer; }
    button.active { border-color: Highlight; background: color-mix(in srgb, Highlight 18%, Canvas); }
    main { max-width: 1180px; margin: 0 auto; padding: 18px 20px 40px; }
    .summary { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 12px; }
    .pill { display: inline-flex; align-items: center; min-height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 650; background: color-mix(in srgb, CanvasText 8%, Canvas); }
    .pill.correct { background: color-mix(in srgb, limegreen 20%, Canvas); }
    .pill.wrong { background: color-mix(in srgb, red 18%, Canvas); }
    .pill.deferred { background: color-mix(in srgb, royalblue 18%, Canvas); }
    .pill.pending { background: color-mix(in srgb, orange 18%, Canvas); }
    .notice { display: none; margin-top: 10px; font-size: 13px; color: color-mix(in srgb, CanvasText 75%, transparent); }
    .notice.show { display: block; }
    .row { border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-left-width: 5px; border-radius: 8px; padding: 14px; margin: 12px 0; background: color-mix(in srgb, CanvasText 3%, Canvas); }
    .row[data-status="correct"] { border-left-color: limegreen; }
    .row[data-status="wrong"] { border-left-color: #d33; }
    .row[data-status="deferred"] { border-left-color: royalblue; }
    .row[data-status="pending"] { border-left-color: orange; }
    .meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .idx { color: color-mix(in srgb, CanvasText 60%, transparent); font-size: 12px; }
    .badge, .delta { display: inline-flex; align-items: center; min-height: 22px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 650; }
    .badge { background: color-mix(in srgb, Highlight 18%, Canvas); }
    .delta { background: color-mix(in srgb, limegreen 18%, Canvas); }
    .delta.negative { background: color-mix(in srgb, red 16%, Canvas); }
    .missing { color: white; background: #b00020; border-radius: 999px; padding: 2px 8px; font-size: 12px; }
    h2 { margin: 0 0 6px; font-size: 16px; line-height: 1.35; overflow-wrap: anywhere; }
    a { color: LinkText; }
    .path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; color: color-mix(in srgb, CanvasText 64%, transparent); overflow-wrap: anywhere; margin-bottom: 10px; }
    .links { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; font-size: 13px; }
    .links span { color: color-mix(in srgb, CanvasText 62%, transparent); }
    .mark { display: flex; gap: 8px; flex-wrap: wrap; align-items: start; margin: 12px 0; }
    .mark textarea { min-width: min(460px, 100%); flex: 1; min-height: 38px; padding: 8px; border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: 6px; background: Canvas; color: CanvasText; }
    details { margin-top: 8px; }
    summary { cursor: pointer; font-size: 13px; font-weight: 650; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 10px; border-radius: 6px; background: color-mix(in srgb, CanvasText 8%, Canvas); font-size: 12px; line-height: 1.45; }
    .hidden { display: none; }
    @media (max-width: 760px) { .controls { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>${htmlEscape(payload.title)}</h1>
    <p class="sub">Generated ${htmlEscape(payload.generatedAt)}. Marks persist to <code>${htmlEscape(REVIEW_FILES[payload.kind].marks)}</code> when served with <code>bun tests/fixtures/hdbits/curation/gain-review.ts --serve</code>.</p>
    <div class="summary" id="summary"></div>
    <div class="controls">
      <input id="q" type="search" placeholder="Search path, names, or notes" autocomplete="off">
      <select id="statusFilter">
        <option value="">All statuses</option>
        <option value="correct">Correct</option>
        <option value="wrong">Wrong</option>
        <option value="deferred">Deferred</option>
        <option value="pending">Pending</option>
      </select>
      <select id="changeFilter">
        <option value="">All changes</option>
      </select>
      <button id="saveAll" type="button">Save all</button>
      <button id="copySummary" type="button">Copy summary</button>
    </div>
    <div class="notice" id="notice"></div>
  </header>
  <main id="list"></main>
  <script>
    const ENTRIES = ${entriesJson};
    const EMBEDDED_MARKS = ${marksJson};
    const EMBEDDED_SUMMARY = ${summaryJson};
    const REVIEW_KIND = ${kindJson};
    const REVIEW_SCOPE = ${scopeJson};
    const storageKey = "yacomp:hdbits-" + REVIEW_KIND + "-review:" + REVIEW_SCOPE + ":" + EMBEDDED_SUMMARY.generatedAt;
    let marks = loadMarks();

    const list = document.querySelector("#list");
    const summary = document.querySelector("#summary");
    const notice = document.querySelector("#notice");
    const q = document.querySelector("#q");
    const statusFilter = document.querySelector("#statusFilter");
    const changeFilter = document.querySelector("#changeFilter");

    bootstrap();

    async function bootstrap() {
      if (location.protocol.startsWith("http")) {
        try {
          const response = await fetch(apiUrl("/api/review"));
          if (response.ok) {
            const payload = await response.json();
            Object.assign(marks, payload.marks || {});
          }
        } catch {}
      }
      renderChangeFilter();
      renderRows();
      updateSummary();
      applyFilter();
    }

    function loadMarks() {
      try {
        const local = JSON.parse(localStorage.getItem(storageKey) || "null");
        return local && typeof local === "object" ? { ...EMBEDDED_MARKS, ...local } : { ...EMBEDDED_MARKS };
      } catch {
        return { ...EMBEDDED_MARKS };
      }
    }

    function renderChangeFilter() {
      const changes = [...new Set(ENTRIES.map((entry) => entry.baselineGrids + "->" + entry.newGrids))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      for (const value of changes) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        changeFilter.append(option);
      }
    }

    function renderRows() {
      list.innerHTML = "";
      ENTRIES.forEach((entry, index) => {
        const mark = marks[entry.id] || { status: "pending", note: "", updatedAt: "" };
        const row = document.createElement("article");
        row.className = "row";
        row.dataset.id = entry.id;
        row.dataset.status = mark.status;
        row.dataset.change = entry.baselineGrids + "->" + entry.newGrids;
        row.dataset.text = (entry.id + " " + (entry.originalUrl || "") + " " + JSON.stringify(entry.newNames) + " " + mark.note).toLowerCase();
        const localLink = location.protocol.startsWith("http")
          ? "/case?id=" + encodeURIComponent(entry.id)
          : entry.fileUri;
        const originalLink = entry.originalUrl
          ? '<a href="' + escapeAttr(entry.originalUrl) + '" target="_blank" rel="noreferrer">Original HDBits</a>'
          : '<span>source not recorded</span>';
        row.innerHTML = \`
          <div class="meta">
            <span class="idx">#\${index + 1}</span>
            <span class="badge">\${entry.baselineGrids} &rarr; \${entry.newGrids}</span>
            <span class="delta \${entry.delta < 0 ? "negative" : ""}">\${formatDelta(entry.delta)}</span>
            \${entry.exists ? "" : '<span class="missing">missing</span>'}
          </div>
          <h2>\${escapeHtml(entry.shortName)}</h2>
          <div class="path">\${escapeHtml(entry.id)}</div>
          <div class="links">
            <a href="\${escapeAttr(localLink)}" target="_blank" rel="noreferrer">Local HTML</a>
            <span>·</span>
            \${originalLink}
          </div>
          <div class="mark">
            <button type="button" data-mark="correct" class="\${mark.status === "correct" ? "active" : ""}">Correct</button>
            <button type="button" data-mark="wrong" class="\${mark.status === "wrong" ? "active" : ""}">Wrong</button>
            <button type="button" data-mark="deferred" class="\${mark.status === "deferred" ? "active" : ""}">Deferred</button>
            <button type="button" data-save-row>Save</button>
            <textarea data-note placeholder="Optional note">\${escapeHtml(mark.note || "")}</textarea>
          </div>
          <details open>
            <summary>New names</summary>
            <pre>\${escapeHtml(JSON.stringify(entry.newNames, null, 2))}</pre>
          </details>
          <details>
            <summary>Baseline names</summary>
            <pre>\${escapeHtml(JSON.stringify(entry.baselineNames, null, 2))}</pre>
          </details>\`;
        list.append(row);
      });
    }

    list.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-mark]");
      if (button) {
        const row = button.closest(".row");
        const id = row.dataset.id;
        const status = button.dataset.mark;
        const note = row.querySelector("[data-note]").value;
        setMark(id, status, note);
        return;
      }
      const saveButton = event.target.closest("button[data-save-row]");
      if (saveButton) {
        const row = saveButton.closest(".row");
        const id = row.dataset.id;
        const status = marks[id]?.status || "correct";
        const note = row.querySelector("[data-note]").value;
        setMark(id, status, note);
      }
    });

    list.addEventListener("change", (event) => {
      if (!event.target.matches("[data-note]")) return;
      const row = event.target.closest(".row");
      const id = row.dataset.id;
      const status = marks[id]?.status || "pending";
      setMark(id, status, event.target.value);
    });

    q.addEventListener("input", applyFilter);
    statusFilter.addEventListener("change", applyFilter);
    changeFilter.addEventListener("change", applyFilter);
    document.querySelector("#copySummary").addEventListener("click", async () => {
      const text = JSON.stringify(buildSummary(), null, 2);
      await navigator.clipboard.writeText(text);
      showNotice("Summary copied to clipboard.");
    });
    document.querySelector("#saveAll").addEventListener("click", saveAllMarks);

    async function setMark(id, status, note) {
      marks[id] = { status, note, updatedAt: new Date().toISOString() };
      localStorage.setItem(storageKey, JSON.stringify(marks));
      renderRows();
      updateSummary();
      applyFilter();
      if (location.protocol.startsWith("http")) {
        try {
          const response = await fetch(apiUrl("/api/marks"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, mark: marks[id] }),
          });
          if (!response.ok) throw new Error(await response.text());
          const payload = await response.json();
          marks = payload.marks || marks;
          localStorage.setItem(storageKey, JSON.stringify(marks));
          showNotice("Saved to " + REVIEW_KIND + "-review-marks.json and " + REVIEW_KIND + "-review-summary.json.");
          return;
        } catch (error) {
          showNotice("Saved in this browser only. Run the local server to persist to disk.");
          return;
        }
      }
      showNotice("Saved in this browser only. Run the local server to persist to disk.");
    }

    async function saveAllMarks() {
      syncNotesFromDom();
      localStorage.setItem(storageKey, JSON.stringify(marks));
      if (location.protocol.startsWith("http")) {
        try {
          const response = await fetch(apiUrl("/api/marks"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ marks }),
          });
          if (!response.ok) throw new Error(await response.text());
          const payload = await response.json();
          marks = payload.marks || marks;
          localStorage.setItem(storageKey, JSON.stringify(marks));
          renderRows();
          updateSummary();
          applyFilter();
          showNotice("Saved all marks to " + REVIEW_KIND + "-review-marks.json and " + REVIEW_KIND + "-review-summary.json.");
          return;
        } catch {}
      }
      showNotice("Saved in this browser only. Run the local server to persist to disk.");
    }

    function syncNotesFromDom() {
      for (const row of document.querySelectorAll(".row")) {
        const id = row.dataset.id;
        const status = marks[id]?.status || "correct";
        const note = row.querySelector("[data-note]").value;
        marks[id] = { status, note, updatedAt: marks[id]?.updatedAt || new Date().toISOString() };
      }
    }

    function buildSummary() {
      const result = { generatedAt: new Date().toISOString(), counts: { total: ENTRIES.length, correct: 0, wrong: 0, deferred: 0, pending: 0 }, wrong: [], deferred: [], correct: [], pending: [] };
      for (const entry of ENTRIES) {
        const mark = marks[entry.id] || { status: "pending", note: "" };
        result.counts[mark.status] += 1;
        result[mark.status].push({ id: entry.id, note: mark.note || "" });
      }
      return result;
    }

    function apiUrl(path) {
      const params = new URLSearchParams({ kind: REVIEW_KIND });
      if (REVIEW_SCOPE !== "all") params.set("scope", REVIEW_SCOPE);
      return path + "?" + params.toString();
    }

    function updateSummary() {
      const current = buildSummary();
      summary.innerHTML = \`
        <span class="pill">Total \${current.counts.total}</span>
        <span class="pill correct">Correct \${current.counts.correct}</span>
        <span class="pill wrong">Wrong \${current.counts.wrong}</span>
        <span class="pill deferred">Deferred \${current.counts.deferred}</span>
        <span class="pill pending">Pending \${current.counts.pending}</span>
        <span class="pill">Visible <span id="visibleCount">0</span></span>\`;
    }

    function applyFilter() {
      const term = q.value.trim().toLowerCase();
      const status = statusFilter.value;
      const change = changeFilter.value;
      let visible = 0;
      for (const row of document.querySelectorAll(".row")) {
        const ok = (!term || row.dataset.text.includes(term)) &&
          (!status || row.dataset.status === status) &&
          (!change || row.dataset.change === change);
        row.classList.toggle("hidden", !ok);
        if (ok) visible += 1;
      }
      const count = document.querySelector("#visibleCount");
      if (count) count.textContent = String(visible);
    }

    function showNotice(text) {
      notice.textContent = text;
      notice.classList.add("show");
    }

    function formatDelta(delta) {
      return delta > 0 ? "+" + delta : String(delta);
    }

    function escapeHtml(value) {
      return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    function escapeAttr(value) {
      return escapeHtml(value).replaceAll("'", "&#39;");
    }
  </script>
</body>
</html>
`;
}

function resolveDataFile(repoRoot: string, scratchDir: string, value: string | undefined, fallback: string): string {
  const file = value ?? fallback;
  return file.includes("/") || file.includes("\\") ? resolve(repoRoot, file) : join(scratchDir, file);
}

function buildPayload(kind: ReviewKind, options: WriteOptions = {}): ReviewPayload {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const scratchDir = resolve(repoRoot, options.scratchDir ?? DEFAULT_SCRATCH);
  const now = options.now ?? new Date().toISOString();
  const baselineRows = readJsonFile<SweepRow[]>(
    resolveDataFile(repoRoot, scratchDir, options.baselineFile, "_baseline.json"),
    [],
  );
  const newRows = readJsonFile<SweepRow[]>(
    resolveDataFile(repoRoot, scratchDir, options.newFile, "new-out.json"),
    [],
  );
  const entries = kind === "gain"
    ? buildGainReviewEntries({ repoRoot, baselineRows, newRows })
    : kind === "loss"
      ? buildLossReviewEntries({ repoRoot, baselineRows, newRows })
      : buildNameReviewEntries({ repoRoot, baselineRows, newRows });
  const files = REVIEW_FILES[kind];
  const previousMarks = readMarksFile(join(scratchDir, files.marks));
  const marks = mergeGainMarks(entries, previousMarks, now);
  const summary = summarizeGainReview(entries, marks, now);
  return { kind, scope: "all", title: files.title, generatedAt: now, entries, marks, summary };
}

function writeReviewFiles(kind: ReviewKind, options: WriteOptions = {}): ReviewPayload {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const scratchDir = resolve(repoRoot, options.scratchDir ?? DEFAULT_SCRATCH);
  mkdirSync(scratchDir, { recursive: true });
  const payload = buildPayload(kind, { ...options, repoRoot, scratchDir });
  const files = REVIEW_FILES[kind];

  writeJsonFile(join(scratchDir, files.json), payload.entries);
  writeJsonFile(join(scratchDir, files.marks), {
    generatedAt: payload.generatedAt,
    marks: payload.marks,
  });
  writeJsonFile(join(scratchDir, files.summary), payload.summary);
  writeFileSync(join(scratchDir, files.html), renderGainReviewHtml(payload));

  return payload;
}

export function writeGainReviewFiles(options: WriteOptions = {}): ReviewPayload {
  return writeReviewFiles("gain", options);
}

export function writeNameReviewFiles(options: WriteOptions = {}): ReviewPayload {
  return writeReviewFiles("name", options);
}

export function writeLossReviewFiles(options: WriteOptions = {}): ReviewPayload {
  return writeReviewFiles("loss", options);
}

function readPayloadFromDisk(kind: ReviewKind, scratchDir: string, scope: ReviewScope = "all"): ReviewPayload {
  const files = REVIEW_FILES[kind];
  const entries = readJsonFile<GainReviewEntry[]>(join(scratchDir, files.json), []);
  const marks = readMarksFile(join(scratchDir, files.marks));
  const summary = summarizeGainReview(entries, marks, new Date().toISOString());
  const payload: ReviewPayload = {
    kind,
    scope: "all",
    title: files.title,
    generatedAt: summary.generatedAt,
    entries,
    marks,
    summary,
  };
  return scopedPayload(payload, scope, summary.generatedAt);
}

async function serveGainReview(
  repoRoot: string,
  scratchDir: string,
  port: number,
  hostname: string,
  options: WriteOptions = {},
): Promise<void> {
  writeGainReviewFiles({ ...options, repoRoot, scratchDir });
  writeNameReviewFiles({ ...options, repoRoot, scratchDir });
  writeLossReviewFiles({ ...options, repoRoot, scratchDir });

  const server = Bun.serve({
    hostname,
    port,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/" || url.pathname === "/gain" || url.pathname === `/${REVIEW_FILES.gain.html}`) {
        return new Response(renderGainReviewHtml(readPayloadFromDisk("gain", scratchDir, reviewScopeFromUrl(url))), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (url.pathname === "/name" || url.pathname === `/${REVIEW_FILES.name.html}`) {
        return new Response(renderGainReviewHtml(readPayloadFromDisk("name", scratchDir, reviewScopeFromUrl(url))), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (url.pathname === "/loss" || url.pathname === `/${REVIEW_FILES.loss.html}`) {
        return new Response(renderGainReviewHtml(readPayloadFromDisk("loss", scratchDir, reviewScopeFromUrl(url))), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (url.pathname === "/api/review") {
        const kind = reviewKindFromUrl(url);
        return Response.json(readPayloadFromDisk(kind, scratchDir, reviewScopeFromUrl(url)));
      }
      if (url.pathname === "/api/summary") {
        const kind = reviewKindFromUrl(url);
        return Response.json(readPayloadFromDisk(kind, scratchDir, reviewScopeFromUrl(url)).summary);
      }
      if (url.pathname === "/api/marks" && req.method === "POST") {
        const kind = reviewKindFromUrl(url);
        const scope = reviewScopeFromUrl(url);
        const files = REVIEW_FILES[kind];
        const body = await req.json() as { id?: string; mark?: GainMark; marks?: GainMarks };
        const payload = readPayloadFromDisk(kind, scratchDir, "all");
        const scopedEntries = filterReviewEntriesByScope(payload.entries, scope);
        const scopedIds = new Set(scopedEntries.map((entry) => entry.id));
        const now = new Date().toISOString();
        if (body.marks && typeof body.marks === "object") {
          for (const entry of scopedEntries) {
            payload.marks[entry.id] = normalizedMark(body.marks[entry.id], now);
          }
          payload.summary = summarizeGainReview(payload.entries, payload.marks, now);
          writeJsonFile(join(scratchDir, files.marks), {
            generatedAt: payload.summary.generatedAt,
            marks: payload.marks,
          });
          writeJsonFile(join(scratchDir, files.summary), payload.summary);
          const scoped = scopedPayload(payload, scope, payload.summary.generatedAt);
          return Response.json({ marks: scoped.marks, summary: scoped.summary });
        }
        if (!body.id || !scopedIds.has(body.id)) {
          return new Response("Unknown review id", { status: 400 });
        }
        payload.marks[body.id] = normalizedMark(body.mark, now);
        payload.summary = summarizeGainReview(payload.entries, payload.marks, now);
        writeJsonFile(join(scratchDir, files.marks), {
          generatedAt: payload.summary.generatedAt,
          marks: payload.marks,
        });
        writeJsonFile(join(scratchDir, files.summary), payload.summary);
        const scoped = scopedPayload(payload, scope, payload.summary.generatedAt);
        return Response.json({ marks: scoped.marks, summary: scoped.summary });
      }
      if (url.pathname === "/case") {
        const id = url.searchParams.get("id") ?? "";
        const gainPayload = readPayloadFromDisk("gain", scratchDir);
        const namePayload = readPayloadFromDisk("name", scratchDir);
        const lossPayload = readPayloadFromDisk("loss", scratchDir);
        if (![...gainPayload.entries, ...namePayload.entries, ...lossPayload.entries].some((entry) => entry.id === id)) {
          return new Response("Unknown review id", { status: 404 });
        }
        const absPath = resolve(repoRoot, id);
        if (!absPath.startsWith(`${repoRoot}/`) || !existsSync(absPath)) {
          return new Response("Missing case file", { status: 404 });
        }
        return new Response(readFileSync(absPath), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });

  const origin = `http://${hostname}:${server.port}`;
  console.log(`HDBits gain review: ${origin}/gain`);
  console.log(`HDBits name review: ${origin}/name`);
  console.log(`HDBits loss review: ${origin}/loss`);
}

function reviewKindFromUrl(url: URL): ReviewKind {
  return reviewKindFromValue(url.searchParams.get("kind"));
}

function reviewKindFromValue(value: string | null): ReviewKind {
  return value === "name" || value === "loss" ? value : "gain";
}

function reviewScopeFromUrl(url: URL): ReviewScope {
  return reviewScopeFromValue(url.searchParams.get("scope"));
}

function reviewScopeFromValue(value: string | null): ReviewScope {
  if (value === "torrents") return "torrents";
  if (value === "non-torrents" || value === "forums") return "non-torrents";
  return "all";
}

function argValue(prefix: string, fallback: string): string {
  const arg = Bun.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

if (import.meta.main) {
  const repoRoot = resolve(process.cwd());
  const scratchDir = resolve(repoRoot, argValue("--scratch=", DEFAULT_SCRATCH));
  const port = Number(argValue("--port=", "4187"));
  const hostname = argValue("--host=", "127.0.0.1");
  const baselineFile = argValue("--baseline=", "_baseline.json");
  const newFile = argValue("--new=", "new-out.json");
  if (Bun.argv.includes("--serve")) {
    await serveGainReview(repoRoot, scratchDir, Number.isFinite(port) ? port : 4187, hostname, {
      baselineFile,
      newFile,
    });
  } else {
    const kinds: ReviewKind[] = Bun.argv.includes("--all")
      ? ["gain", "name", "loss"]
      : [reviewKindFromValue(argValue("--kind=", "gain"))];
    for (const kind of kinds) {
      const payload = writeReviewFiles(kind, { repoRoot, scratchDir, baselineFile, newFile });
      const files = REVIEW_FILES[kind];
      if (payload.entries.length > 0) {
        console.log(`${kind.toUpperCase()} review generated: ${join(scratchDir, files.html)} (${payload.entries.length} rows)`);
        console.log(`Marks: ${join(scratchDir, files.marks)}`);
        console.log(`Summary: ${join(scratchDir, files.summary)}`);
      } else {
        console.log(`No ${kind.toUpperCase()} rows found.`);
      }
    }
  }
}
