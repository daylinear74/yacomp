// Pick one representative (smallest body = most minimal shape) per cluster
// and emit the candidate list the oracle will run against.
import { readFileSync, writeFileSync, statSync } from "node:fs";

const S = "tests/fixtures/hdbits/curation/.scratch";
const clusters = JSON.parse(readFileSync(`${S}/clusters.json`, "utf-8"));

function splitHeaderBody(content: string) {
  const m = content.match(/^<!--([\s\S]*?)-->/);
  return { header: m ? m[1] : "", body: content.replace(/^<!--[\s\S]*?-->/, "").trim() };
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

const candidates: any[] = [];
for (const cl of clusters.clusters) {
  let best = cl.members[0];
  let bestSize = Infinity;
  for (const p of cl.members) {
    const s = statSync(p).size;
    if (s < bestSize) (bestSize = s), (best = p);
  }
  const content = readFileSync(best, "utf-8");
  const { header, body } = splitHeaderBody(content);
  candidates.push({
    id: best,
    sig: cl.sig,
    clusterCount: cl.count,
    slot: headerField(header, "slot") || "forum.post",
    body,
    torrentTitle: (headerField(header, "torrent_title") || "").replace(/^"|"$/g, "") || undefined,
    threadTitle: (headerField(header, "thread_title") || "").replace(/^"|"$/g, "") || undefined,
  });
}
writeFileSync(`${S}/candidates.json`, JSON.stringify(candidates, null, 2));
console.log(`wrote ${candidates.length} candidates`);
