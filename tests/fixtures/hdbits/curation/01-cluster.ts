import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Dump locations (gitignored, local-only curation source).
const DUMPS = [
  { dir: "yacomp-fixtures-2026-05-28/cases-bootstrapped", kind: "forum" },
  { dir: "yacomp-torrents-fixtures-2026-05-28/cases-bootstrapped", kind: "torrent" },
];

const OUT = "tests/fixtures/hdbits/curation/.scratch";
mkdirSync(OUT, { recursive: true });

interface Rec {
  path: string; // relative to repo root
  file: string;
  slot: string;
  sig: string;
  thumbs: number;
  bootGrids: number | null;
}

function splitHeaderBody(content: string): { header: string; body: string } {
  const m = content.match(/^<!--([\s\S]*?)-->/);
  return {
    header: m ? m[1] : "",
    body: content.replace(/^<!--[\s\S]*?-->/, "").trim(),
  };
}

function headerField(header: string, key: string): string | null {
  for (const raw of header.split("\n")) {
    const line = raw.trim();
    const c = line.indexOf(":");
    if (c < 0) continue;
    if (line.slice(0, c).trim() === key) return line.slice(c + 1).trim();
  }
  return null;
}

function bucket(n: number): string {
  if (n === 0) return "0";
  if (n === 1) return "1";
  if (n <= 4) return "2-4";
  if (n <= 12) return "5-12";
  if (n <= 30) return "13-30";
  return "31+";
}

function signature(body: string, slot: string): { sig: string; thumbs: number } {
  const thumbs = (body.match(/\/\/t\.hdbits\.org\/[^."]+\.jpg/gi) || []).length;
  const strongCount = (body.match(/<strong\b/gi) || []).length;
  const f: string[] = [
    slot,
    "tc:" + bucket(thumbs),
    "st:" + bucket(strongCount),
  ];
  const has = (re: RegExp, tag: string) => {
    if (re.test(body)) f.push(tag);
  };
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
  return { sig: f.join("|"), thumbs };
}

const recs: Rec[] = [];
for (const { dir } of DUMPS) {
  let files: string[];
  try {
    files = readdirSync(dir).filter((x) => x.endsWith(".html"));
  } catch {
    console.error(`missing dump dir: ${dir}`);
    continue;
  }
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf-8");
    const { header, body } = splitHeaderBody(content);
    const slot = headerField(header, "slot") || "unknown";
    const { sig, thumbs } = signature(body, slot);
    const bg = headerField(header, "expected_grids");
    recs.push({
      path: join(dir, file),
      file,
      slot,
      sig,
      thumbs,
      bootGrids: bg && bg !== "TODO" ? parseInt(bg, 10) : null,
    });
  }
}

// Cluster by signature.
const clusters = new Map<string, Rec[]>();
for (const r of recs) {
  if (!clusters.has(r.sig)) clusters.set(r.sig, []);
  clusters.get(r.sig)!.push(r);
}

const sorted = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length);

writeFileSync(
  join(OUT, "clusters.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalFiles: recs.length,
      clusterCount: clusters.size,
      clusters: sorted.map(([sig, rs]) => ({
        sig,
        count: rs.length,
        // representative = smallest body in the cluster (cleanest/minimal)
        members: rs.map((r) => r.path),
      })),
    },
    null,
    2,
  ),
);

console.log(`files=${recs.length} clusters=${clusters.size}`);
console.log("top 40 clusters:");
for (const [sig, rs] of sorted.slice(0, 40)) {
  console.log(String(rs.length).padStart(5), sig);
}
console.log(`singletons: ${sorted.filter(([, rs]) => rs.length === 1).length}`);
