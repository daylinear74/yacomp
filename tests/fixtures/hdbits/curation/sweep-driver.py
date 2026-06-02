#!/usr/bin/env python3
"""Run the local HDBits fast-oracle sweep in restartable chunks.

The scrape data, fast oracle, baselines, and outputs live under the gitignored
`.scratch/` directory from the handoff data bundle. This tracked driver keeps
the operational policy durable: default sweeps cover torrent pages only, and the
forum/non-torrent corpus runs only when requested explicitly.
"""
import argparse
import json
import os
import subprocess
import sys

S = "tests/fixtures/hdbits/curation/.scratch"
ORACLE = f"{S}/fast-oracle.ts"
ALL = f"{S}/all-cands.json"
CHUNK = 120
OS_TIMEOUT = 240
MAX_RETRY = 6

TORRENT_PREFIX = "yacomp-torrents-fixtures-"


def load_json(path, fallback=None):
    if not os.path.exists(path):
        if fallback is not None:
            return fallback
        raise FileNotFoundError(path)
    with open(path) as f:
        return json.load(f)


def dump_json(path, value):
    with open(path, "w") as f:
        json.dump(value, f)


def is_torrent(row):
    return str(row.get("id", "")).startswith(TORRENT_PREFIX)


def normalize_scope(value):
    return "non-torrents" if value == "forums" else value


def split_rows(rows):
    torrents = [row for row in rows if is_torrent(row)]
    non_torrents = [row for row in rows if not is_torrent(row)]
    return torrents, non_torrents


def write_split_files(all_cands):
    torrents, non_torrents = split_rows(all_cands)
    dump_json(f"{S}/all-cands-torrents.json", torrents)
    dump_json(f"{S}/all-cands-non-torrents.json", non_torrents)

    baseline = load_json(f"{S}/_baseline.json", [])
    if baseline:
        baseline_torrents, baseline_non_torrents = split_rows(baseline)
        dump_json(f"{S}/_baseline-torrents.json", baseline_torrents)
        dump_json(f"{S}/_baseline-non-torrents.json", baseline_non_torrents)

    print(
        f"split counts: torrents={len(torrents)} non-torrents={len(non_torrents)} all={len(all_cands)}",
        flush=True,
    )
    return {
        "all": all_cands,
        "torrents": torrents,
        "non-torrents": non_torrents,
    }


def output_file(scope):
    if scope == "torrents":
        return f"{S}/new-out-torrents.json"
    if scope == "non-torrents":
        return f"{S}/new-out-non-torrents.json"
    return f"{S}/new-out.json"


parser = argparse.ArgumentParser()
parser.add_argument(
    "--scope",
    choices=["torrents", "non-torrents", "forums", "all"],
    default="torrents",
    help="default: torrents; use non-torrents/forums only when explicitly requested",
)
parser.add_argument("--split-only", action="store_true", help="write split candidate/baseline files and exit")
args = parser.parse_args()
scope = normalize_scope(args.scope)

all_cands = load_json(ALL)
by_scope = write_split_files(all_cands)
if args.split_only:
    sys.exit(0)

cands = by_scope[scope]
out = output_file(scope)
n = len(cands)
results = []
print(f"sweep scope={scope} rows={n} -> {out}", flush=True)
for start in range(0, n, CHUNK):
    chunk = cands[start:start + CHUNK]
    slice_f = f"{S}/_chunk_in.json"
    out_f = f"{S}/_chunk_out.json"
    dump_json(slice_f, chunk)
    if os.path.exists(out_f):
        os.remove(out_f)
    done = 0
    cur = []
    for attempt in range(MAX_RETRY):
        try:
            subprocess.run(
                ["bun", ORACLE, slice_f, out_f],
                check=False,
                capture_output=True,
                timeout=OS_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            print(f"  chunk {start} attempt {attempt + 1} timed out", flush=True)
        except Exception as e:
            print(f"  chunk {start} attempt {attempt + 1} raised {e}", flush=True)
        try:
            cur = load_json(out_f, [])
            done = len(cur)
        except Exception:
            cur, done = [], 0
        if done >= len(chunk):
            break
        print(f"  chunk {start}: {done}/{len(chunk)} after attempt {attempt + 1}, retrying", flush=True)
    results.extend(cur)
    dump_json(out, results)
    print(f"chunk {start}-{start + len(chunk) - 1}: {done}/{len(chunk)} | total {len(results)}/{n}", flush=True)

print(f"DONE: {len(results)}/{n} -> {out}", flush=True)
