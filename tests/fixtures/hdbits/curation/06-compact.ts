import { readFileSync, writeFileSync, rmSync } from "node:fs";

const CUR = "tests/fixtures/hdbits/curation";
const old = JSON.parse(readFileSync(`${CUR}/progress.json`, "utf-8"));

// Build per-cluster (signature) decision table + slim file->sig index.
const clusters: Record<string, any> = {};
const files: Record<string, string> = {};
for (const [path, rec] of Object.entries<any>(old.files)) {
  files[path] = rec.sig;
  if (!clusters[rec.sig]) {
    clusters[rec.sig] = { status: rec.status, count: 0 };
    if (rec.case) clusters[rec.sig].case = rec.case;
    if (rec.reason) clusters[rec.sig].reason = rec.reason;
  }
  clusters[rec.sig].count++;
}

const out = {
  version: 2,
  updatedAt: new Date().toISOString(),
  note:
    "Resumable HDBits fixture-curation tracker. The scrape dumps (yacomp-*-fixtures-*/) are gitignored/local-only; this file records, per structural cluster, the decision made so a future agent can resume without re-reading processed files. `files` maps every processed dump path to its cluster signature (presence = already reviewed). `clusters` holds the decision per signature: extracted (became cases/<file>), covered-by-existing (behavior already in a hand-written case), needs-review (parser output looked unreliable — revisit and curate manually), skipped (redundant shape, behavior already represented). To continue: cluster any new/unprocessed dump files, look up their signature here, and only act on signatures not yet decided.",
  totalDumpFiles: Object.keys(files).length,
  clusterCount: Object.keys(clusters).length,
  emittedCases: Object.values(clusters).filter((c: any) => c.status === "extracted").length,
  clusters,
  files,
};
writeFileSync(`${CUR}/progress.json`, JSON.stringify(out, null, 2) + "\n");
rmSync(`${CUR}/.scratch/clusters.json`, { force: true });
console.log("compacted. clusters:", out.clusterCount, "files:", out.totalDumpFiles, "cases:", out.emittedCases);
