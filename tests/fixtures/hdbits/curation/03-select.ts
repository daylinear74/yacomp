import { readFileSync, writeFileSync } from "node:fs";

const S = "tests/fixtures/hdbits/curation/.scratch";
const cands = JSON.parse(readFileSync(`${S}/candidates.json`, "utf-8"));
const out = JSON.parse(readFileSync(`${S}/oracle-out.json`, "utf-8"));
const byId = new Map(out.map((r: any) => [r.id, r]));

const BAD = [
  /^\d{4}$/, /\b\d{2,5}\s*kbps\b/i, /\b\d+(\.\d+)?\s*(gi?b|mi?b|ki?b)\b/i,
  /\bhttps?:\/\//i, /slow\.pics|imgbox|imgur|gifyu|ibb\.co|postimg/i,
  /\[\/?\w+\]/, /[\n\r]/, /\b\d{1,2}:\d{2}(:\d{2})?\b/,
  /@\w/, /^\s*[-~]/, /video size/i,
];
function polluted(names: (string[] | null)[]): boolean {
  for (const ns of names) {
    if (!ns) continue;
    for (const n of ns) {
      if (n.length > 45) return true;
      if (n.split(/\s+/).length > 7) return true;
      for (const re of BAD) if (re.test(n)) return true;
    }
  }
  return false;
}

function strategyTag(sig: string): string {
  const has = (t: string) => sig.includes(t);
  if (has("color")) return "color";
  if (has("showhide")) return "showhide";
  if (/\|st:(1|2-4|5-12|13-30|31\+)/.test(sig)) return "strong";
  if (has("numlabel")) return "numlabel";
  if (has("vs|pipe")) return "plain-vs";
  return "none";
}
function fpTag(sig: string): string {
  // distinguishing reasons a zero-grid input is rejected
  if (sig.includes("extlink")) return "extlink";
  if (sig.includes("dashed")) return "bdinfo";
  if (sig.includes("extimg")) return "extimg";
  if (sig.includes("smilie")) return "smilie";
  return "plain";
}

const groups = new Map<string, any[]>();
for (const c of cands) {
  const r: any = byId.get(c.id);
  if (!r || r.grids < 0) continue;
  const pol = polluted(r.names);
  const cols = r.names.map((n: string[] | null) => (n ? n.length : 0)).join(",");
  let key: string;
  if (r.grids === 0) {
    key = `${c.slot}|g0|fp:${fpTag(c.sig)}`;
  } else {
    key = `${c.slot}|g${r.grids}|c[${cols}]|${pol ? "POL" : "ok"}|${strategyTag(c.sig)}`;
  }
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push({ ...c, r, pol });
}

console.log(`selection keys = ${groups.size}`);
const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [k, v] of sorted) console.log(String(v.length).padStart(4), k);

// Pick cleanest minimal representative per key.
const picks = sorted.map(([key, members]) => {
  // prefer non-polluted, then smallest body, then biggest clusterCount
  const ranked = [...members].sort((a, b) => {
    if (a.pol !== b.pol) return a.pol ? 1 : -1;
    return a.body.length - b.body.length;
  });
  return { key, pick: ranked[0], alt: members.length };
});
writeFileSync(`${S}/picks.json`, JSON.stringify(picks, null, 2));
console.log(`\nwrote ${picks.length} picks`);
