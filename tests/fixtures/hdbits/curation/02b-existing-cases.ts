// Build an oracle candidate list from the already-curated cases/*.html so
// 04-generate can skip behavioral keys already covered by a hand-written case.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "tests/fixtures/hdbits/cases";
const S = "tests/fixtures/hdbits/curation/.scratch";

function hb(c: string, k: string): string | null {
  const m = c.match(/^<!--([\s\S]*?)-->/);
  if (!m) return null;
  for (const r of m[1].split("\n")) {
    const l = r.trim();
    const i = l.indexOf(":");
    if (i < 0) continue;
    if (l.slice(0, i).trim() === k) return l.slice(i + 1).trim();
  }
  return null;
}

const out: any[] = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".html")).sort()) {
  const c = readFileSync(`${DIR}/${f}`, "utf-8");
  out.push({
    id: "EXIST/" + f,
    sig: "",
    slot: hb(c, "slot") || "forum.post",
    body: c.replace(/^<!--[\s\S]*?-->/, "").trim(),
    torrentTitle: (hb(c, "torrent_title") || "").replace(/^"|"$/g, "") || undefined,
    threadTitle: (hb(c, "thread_title") || "").replace(/^"|"$/g, "") || undefined,
  });
}
writeFileSync(`${S}/existing-cands.json`, JSON.stringify(out, null, 2));
console.log("existing cases:", out.length);
