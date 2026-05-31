import { describe, expect, test } from "bun:test";
import {
  buildGainReviewEntries,
  buildNameReviewEntries,
  originalUrlFromCaseHtml,
  mergeGainMarks,
  summarizeGainReview,
} from "../fixtures/hdbits/curation/gain-review";

const repoRoot = "/repo";

describe("HDBits gain review generation", () => {
  test("lists only non-flaky grid gains", () => {
    const entries = buildGainReviewEntries({
      repoRoot,
      baselineRows: [
        { id: "corpus/a.html", grids: 0, names: null },
        { id: "corpus/b.html", grids: 1, names: [["Old"]] },
        { id: "corpus/c.html", grids: 2, names: null },
        { id: "corpus/flaky.html", grids: -1, names: null },
      ],
      newRows: [
        { id: "corpus/a.html", grids: 1, names: [["A", "B"]] },
        { id: "corpus/b.html", grids: 1, names: [["New"]] },
        { id: "corpus/c.html", grids: 1, names: null },
        { id: "corpus/flaky.html", grids: 1, names: null },
      ],
    });

    expect(entries.map((entry) => entry.id)).toEqual(["corpus/a.html"]);
    expect(entries[0].baselineGrids).toBe(0);
    expect(entries[0].newGrids).toBe(1);
    expect(entries[0].newNames).toEqual([["A", "B"]]);
  });

  test("lists name changes only when grid counts are unchanged", () => {
    const entries = buildNameReviewEntries({
      repoRoot,
      baselineRows: [
        { id: "corpus/name.html", grids: 1, names: [["Old"]] },
        { id: "corpus/gain.html", grids: 0, names: null },
        { id: "corpus/same.html", grids: 1, names: [["Same"]] },
        { id: "corpus/flaky.html", grids: -1, names: [["Old"]] },
      ],
      newRows: [
        { id: "corpus/name.html", grids: 1, names: [["New"]] },
        { id: "corpus/gain.html", grids: 1, names: [["Gain"]] },
        { id: "corpus/same.html", grids: 1, names: [["Same"]] },
        { id: "corpus/flaky.html", grids: 1, names: [["New"]] },
      ],
    });

    expect(entries.map((entry) => entry.id)).toEqual(["corpus/name.html"]);
    expect(entries[0].baselineGrids).toBe(1);
    expect(entries[0].newGrids).toBe(1);
    expect(entries[0].baselineNames).toEqual([["Old"]]);
    expect(entries[0].newNames).toEqual([["New"]]);
  });

  test("extracts the original HDBits URL only when it was recorded in notes", () => {
    expect(originalUrlFromCaseHtml(`<!--
slot: forum.post
notes: AUTO-BOOTSTRAPPED - scraped from https://hdbits.org/forums/viewtopic?topicid=59424 (post #14) on 2026-05-28
-->`)).toBe("https://hdbits.org/forums/viewtopic?topicid=59424");

    expect(originalUrlFromCaseHtml(`<!--
slot: forum.post
notes: AUTO-BOOTSTRAPPED - REVIEW before merging.
-->`)).toBeNull();
  });

  test("preserves existing marks and initializes new rows as correct", () => {
    const entries = [
      {
        id: "corpus/a.html",
        shortName: "a.html",
        fileUri: "file:///repo/corpus/a.html",
        exists: true,
        baselineGrids: 0,
        newGrids: 1,
        delta: 1,
        baselineNames: null,
        newNames: [["A", "B"]],
      },
      {
        id: "corpus/b.html",
        shortName: "b.html",
        fileUri: "file:///repo/corpus/b.html",
        exists: true,
        baselineGrids: 1,
        newGrids: 2,
        delta: 1,
        baselineNames: [["Old"]],
        newNames: [["New"]],
      },
    ];

    const marks = mergeGainMarks(entries, {
      "corpus/a.html": {
        status: "correct",
        note: "real comparison",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
      "stale.html": {
        status: "wrong",
        note: "old sweep",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    }, "2026-06-01T01:00:00.000Z");

    expect(Object.keys(marks)).toEqual(["corpus/a.html", "corpus/b.html"]);
    expect(marks["corpus/a.html"]).toEqual({
      status: "correct",
      note: "real comparison",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(marks["corpus/b.html"]).toEqual({
      status: "correct",
      note: "",
      updatedAt: "2026-06-01T01:00:00.000Z",
    });
  });

  test("summarizes mark counts and wrong ids", () => {
    const entries = [
      { id: "corpus/a.html" },
      { id: "corpus/b.html" },
      { id: "corpus/c.html" },
    ];
    const summary = summarizeGainReview(entries, {
      "corpus/a.html": { status: "correct", note: "", updatedAt: "x" },
      "corpus/b.html": { status: "wrong", note: "false positive", updatedAt: "x" },
    }, "2026-06-01T02:00:00.000Z");

    expect(summary.counts).toEqual({
      total: 3,
      correct: 2,
      wrong: 1,
      pending: 0,
    });
    expect(summary.wrong).toEqual([
      { id: "corpus/b.html", note: "false positive" },
    ]);
  });
});
