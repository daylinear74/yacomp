import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CASES = "tests/fixtures/hdbits/cases";
const CURATION = "tests/fixtures/hdbits/curation";

// ───────── shared helpers (mirror curate-sig.ts / select.ts) ─────────
function bucket(n: number): string {
  if (n === 0) return "0";
  if (n === 1) return "1";
  if (n <= 4) return "2-4";
  if (n <= 12) return "5-12";
  if (n <= 30) return "13-30";
  return "31+";
}
function signature(body: string, slot: string): string {
  const thumbs = (body.match(/\/\/t\.hdbits\.org\/[^."]+\.jpg/gi) || []).length;
  const strongCount = (body.match(/<strong\b/gi) || []).length;
  const f = [slot, "tc:" + bucket(thumbs), "st:" + bucket(strongCount)];
  const has = (re: RegExp, tag: string) => re.test(body) && f.push(tag);
  has(/<span[^>]*color\s*:/i, "color");
  has(/\bvs\.?\b|\s\|\s/i, "vs|pipe");
  has(/div_showhide|label_showhide/i, "showhide");
  has(/border\s*:[^";]*dashed/i, "dashed");
  has(/<img[^>]+src="(?!https?:\/\/[ti]\.hdbits\.org)/i, "extimg");
  has(/<a[^>]+href="https?:\/\/(?!\w*\.?hdbits\.org)/i, "extlink");
  has(/@\w+/i, "mention");
  has(/\/pic\/smilies|\.gif"/i, "smilie");
  has(/^\s*(source|version|encode|src)\s*\d+\s*[:\-]/im, "numlabel");
  has(/<table[^>]*class="?main/i, "table");
  return f.join("|");
}
function strategyTag(sig: string): string {
  if (sig.includes("color")) return "color";
  if (sig.includes("showhide")) return "showhide";
  if (/\|st:(1|2-4|5-12|13-30|31\+)/.test(sig)) return "strong";
  if (sig.includes("numlabel")) return "numlabel";
  if (sig.includes("vs|pipe")) return "plain-vs";
  return "none";
}
function fpTag(sig: string): string {
  if (sig.includes("extlink")) return "extlink";
  if (sig.includes("dashed")) return "bdinfo";
  if (sig.includes("extimg")) return "extimg";
  if (sig.includes("smilie")) return "smilie";
  return "plain";
}
const BAD = [
  /^\d{4}$/, /\b\d{2,5}\s*kbps\b/i, /\b\d+(\.\d+)?\s*(gi?b|mi?b|ki?b)\b/i,
  /\bhttps?:\/\//i, /slow\.pics|imgbox|imgur|gifyu|ibb\.co|postimg/i,
  /\[\/?\w+\]/, /[\n\r]/, /\b\d{1,2}:\d{2}(:\d{2})?\b/, /@\w/, /^\s*[-~]/, /video size/i,
];
function polluted(names: (string[] | null)[]): boolean {
  for (const ns of names) {
    if (!ns) continue;
    for (const n of ns) {
      if (n.length > 45 || n.split(/\s+/).length > 7) return true;
      for (const re of BAD) if (re.test(n)) return true;
    }
  }
  return false;
}
function behaviorKey(slot: string, grids: number, names: (string[] | null)[], sig: string): string {
  if (grids === 0) return `${slot}|g0|fp:${fpTag(sig)}`;
  const cols = names.map((n) => (n ? n.length : 0)).join(",");
  return `${slot}|g${grids}|c[${cols}]|${polluted(names) ? "POL" : "ok"}|${strategyTag(sig)}`;
}

// ───────── sanitize + genericize a body ─────────
function genericizeImages(body: string): string {
  const order: string[] = [];
  const seen = new Set<string>();
  const re = /\/\/t\.hdbits\.org\/([A-Za-z0-9]+)\.jpg/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) if (!seen.has(m[1])) (seen.add(m[1]), order.push(m[1]));
  const width = Math.max(2, String(order.length).length);
  let out = body;
  order.forEach((h, i) => {
    const token = "g" + String(i + 1).padStart(width, "0");
    out = out.replace(
      new RegExp("(//(?:t|i|img)\\.hdbits\\.org/)" + h + "(?=[.\"/]|$)", "g"),
      "$1" + token,
    );
  });
  return out;
}
function sanitize(body: string): string {
  let b = genericizeImages(body);
  // neutralize external (non-hdbits) image sources
  let extImg = 0;
  b = b.replace(/(<img[^>]+src=")(https?:\/\/(?!\w*\.?hdbits\.org)[^"]*)(")/gi, () => {
    extImg++;
    return `<img src="https://example.invalid/ext-img-${String(extImg).padStart(2, "0")}.jpg"`;
  });
  // neutralize external (non-hdbits) anchor hrefs
  let extLink = 0;
  b = b.replace(/(<a[^>]+href=")(https?:\/\/(?!\w*\.?hdbits\.org)[^"]*)(")/gi, (_m, p1, _u, p3) => {
    extLink++;
    return `${p1}https://example.invalid/link-${String(extLink).padStart(2, "0")}${p3}`;
  });
  // normalize residual @mentions and ids
  b = b.replace(/@[A-Za-z0-9_]{2,}/g, "@User");
  b = b.replace(/details\.php\?id=\d+/g, "details.php?id=999999");
  b = b.replace(/userdetails\.php\?id=\d+/g, "userdetails.php?id=100001");
  b = b.replace(/[?&]passkey=[A-Za-z0-9]+/gi, "");
  return b;
}

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/g, "");
}

// ───────── load data ─────────
const S = join(CURATION, ".scratch");
const picks = JSON.parse(readFileSync(`${S}/picks.json`, "utf-8"));
const oracleOut = JSON.parse(readFileSync(`${S}/oracle-out.json`, "utf-8"));
const byId = new Map(oracleOut.map((r: any) => [r.id, r]));
const clusters = JSON.parse(readFileSync(join(S, "clusters.json"), "utf-8"));

// behavioral keys already covered by existing curated cases
const existCands = JSON.parse(readFileSync(`${S}/existing-cands.json`, "utf-8"));
const existOut = JSON.parse(readFileSync(`${S}/existing-out.json`, "utf-8"));
const existById = new Map(existOut.map((r: any) => [r.id, r]));
const coveredKeys = new Set<string>();
for (const c of existCands) {
  const r: any = existById.get(c.id);
  if (!r || r.grids < 0) continue;
  coveredKeys.add(behaviorKey(c.slot, r.grids, r.names, signature(c.body, c.slot)));
}

// next case number
const existingNums = readdirSync(CASES)
  .map((f) => parseInt(f.slice(0, 3), 10))
  .filter((n) => Number.isFinite(n));
let next = Math.max(0, ...existingNums) + 1;

// ───────── emit ─────────
const slotAbbrev: Record<string, string> = {
  "torrent.description": "torrent-desc",
  "torrent.comment": "torrent-comment",
  "forum.post": "forum-post",
};
const emitted: { key: string; file: string; src: string }[] = [];

for (const p of picks) {
  const key: string = p.key;
  // only emit clean-named cases and false-positive guards; POL kept for review
  const isFp = key.includes("|fp:");
  const isOk = key.includes("|ok|");
  if (!isFp && !isOk) continue;
  if (coveredKeys.has(key)) {
    emitted.push({ key, file: "(skipped: covered by existing case)", src: p.pick.id });
    continue;
  }
  const pick = p.pick;
  const r: any = byId.get(pick.id);
  if (!r) continue;

  const body = sanitize(pick.body);
  const grids = r.grids;
  const named = isOk && grids > 0;

  // descriptive slug hint
  let hint: string;
  if (isFp) {
    hint = "false-positive-" + fpTag(pick.sig);
  } else {
    const first = (r.names[0] || []).slice(0, 3).join("-");
    hint = slugify(first) || strategyTag(pick.sig);
  }
  const strat = isFp ? "guard" : strategyTag(pick.sig);
  const num = String(next++).padStart(3, "0");
  const file = `${num}-${slotAbbrev[pick.slot] || "forum-post"}-${strat}-${hint}`
    .replace(/-+/g, "-")
    .slice(0, 70) + ".html";

  const headerLines = [
    "<!--",
    `slot: ${pick.slot}`,
    `expected_grids: ${grids}`,
  ];
  if (named) headerLines.push(`expected_names: ${JSON.stringify(r.names)}`);
  if (pick.torrentTitle) headerLines.push(`torrent_title: "${sanitize(pick.torrentTitle).replace(/"/g, "")}"`);
  if (pick.threadTitle) headerLines.push(`thread_title: "${sanitize(pick.threadTitle).replace(/"/g, "")}"`);
  const noteKind = isFp
    ? `False-positive guard (${fpTag(pick.sig)}): parser must detect no comparison grid.`
    : `${strategyTag(pick.sig)} name strategy, ${grids} grid(s). Derived from a real HDBits ${pick.slot} shape; images genericized, identifiers scrubbed.`;
  headerLines.push(`notes: ${noteKind} Auto-curated from dump cluster (${p.alt} similar shapes).`);
  headerLines.push("-->");

  writeFileSync(join(CASES, file), headerLines.join("\n") + "\n\n" + body + "\n");
  emitted.push({ key, file, src: pick.id });
}

// ───────── progress.json over ALL dump files ─────────
// Map each dump file to its decision so a future agent can resume.
const pickByCluster = new Map<string, any>();
for (const p of picks) pickByCluster.set(p.pick.sig, p);
const emittedByKey = new Map(emitted.map((e) => [e.key, e]));

const files: Record<string, any> = {};
for (const cl of clusters.clusters) {
  const p = pickByCluster.get(cl.sig);
  const key = p?.key;
  const em = key ? emittedByKey.get(key) : undefined;
  let status: string, detail: any;
  if (em && em.file.startsWith("(skipped")) {
    status = "covered-by-existing";
    detail = {};
  } else if (em) {
    status = "extracted";
    detail = { case: em.file };
  } else if (key && key.includes("|POL|")) {
    status = "needs-review";
    detail = { reason: "parser names look unreliable (pollution heuristic)" };
  } else {
    status = "skipped";
    detail = { reason: "duplicate shape / no distinct behavior" };
  }
  for (const member of cl.members) {
    files[member] = { sig: cl.sig, status, ...detail };
  }
}

writeFileSync(
  join(CURATION, "progress.json"),
  JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      note:
        "Resumable curation tracker. Every dump file (gitignored, local-only) is recorded with the decision made for its structural cluster. status: extracted (became a case), covered-by-existing (behavior already in a hand-written case), needs-review (parser output looked unreliable — revisit), skipped (redundant shape). A future agent reads this to skip processed files and continue.",
      totalDumpFiles: Object.keys(files).length,
      emittedCases: emitted.filter((e) => !e.file.startsWith("(")).length,
      files,
    },
    null,
    2,
  ),
);

console.log(`emitted ${emitted.filter((e) => !e.file.startsWith("(")).length} new case files`);
console.log(`covered-by-existing: ${emitted.filter((e) => e.file.startsWith("(")).length}`);
for (const e of emitted.filter((x) => !x.file.startsWith("("))) console.log("  +", e.file);
