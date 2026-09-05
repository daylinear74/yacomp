import { afterEach, beforeEach, describe, test, expect, spyOn } from "bun:test";
import {
  applyFilterToImg,
  buildFilter,
  orderedRowsAroundAnchor,
  orderedColumnsAroundAnchor,
  orderedCompImageTargetsByAnchor,
  partitionAnchorTargets,
  applyAnchorsThenQueue,
  runBoundedFilterQueue,
  yieldToBrowserPaint,
  type CompImageFilterTarget,
} from "../../src/filters/imaging";
import { setModeIndex } from "../../src/filters/modes";
import type { Comp, RowData } from "../../src/viewer/types";
import { iccChunk, iccProfile, pngHeader } from "../fixtures/color-metadata";

// Tests are organized by the user-facing contract each block protects,
// not by the function name, so a regression on a contract (e.g. "active
// image filters first") points at the right tests immediately.

afterEach(() => setModeIndex(0));

describe("filter composition order", () => {
  test("applies per-source gamma before the shared analysis mode", () => {
    expect(buildFilter("url(#scf-s1)", 1.2, 0.8, "aeqt-0p88")).toBe(
      "url(#scf-gamma-mismatch-aeqt-0p88) url(#scf-s1) " +
      "brightness(1.20) contrast(0.80)",
    );
  });
});

describe("async image-source filtering", () => {
  let fetchMock: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
  beforeEach(() => {
    fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array(pngHeader(iccChunk(iccProfile("2020"))))),
    );
  });
  afterEach(() => fetchMock.mockRestore());

  test("does not commit a colorspace result after the image source changes", async () => {
    setModeIndex(4); // luma
    const img = {
      src: "https://example.com/old-bt2020.webp",
      isConnected: true,
      style: { filter: "" },
    } as unknown as HTMLImageElement;

    const pending = applyFilterToImg(img);
    const provisional = img.style.filter;
    img.src = "https://example.com/new-709.webp";
    await pending;

    expect(provisional).toBe("url(#scf-luma709)");
    expect(img.style.filter).toBe(provisional);
  });

  test("commits the result while the source remains current", async () => {
    setModeIndex(4); // luma
    const img = {
      src: "https://example.com/stable-bt2020.webp",
      isConnected: true,
      style: { filter: "" },
    } as unknown as HTMLImageElement;

    await applyFilterToImg(img);

    expect(img.style.filter).toBe("url(#scf-luma2020)");
  });
});

// ─── contract: column ordering biases toward the anchor ──────────────────────

describe("column ordering — anchor first, then left, then right", () => {
  test("middle anchor of a 5-col grid sweeps leftward, then rightward", () => {
    // (currentCol=2) → anchor, then col 1, col 0, then col 3, col 4.
    // The visible source is at col 2, so its neighbors on either side are
    // filtered before the far edges.
    expect(orderedColumnsAroundAnchor(5, 2)).toEqual([2, 1, 0, 3, 4]);
  });

  test("anchor at the left edge expands only rightward", () => {
    expect(orderedColumnsAroundAnchor(4, 0)).toEqual([0, 1, 2, 3]);
  });

  test("anchor at the right edge expands only leftward", () => {
    expect(orderedColumnsAroundAnchor(4, 3)).toEqual([3, 2, 1, 0]);
  });

  test("clamps a too-high anchor index to the right edge", () => {
    expect(orderedColumnsAroundAnchor(3, 99)).toEqual([2, 1, 0]);
  });

  test("clamps a negative anchor index to the left edge", () => {
    expect(orderedColumnsAroundAnchor(3, -5)).toEqual([0, 1, 2]);
  });

  test("returns an empty list for a zero-column grid", () => {
    expect(orderedColumnsAroundAnchor(0, 0)).toEqual([]);
  });
});

// ─── contract: row ordering alternates outward from the anchor ──────────────

describe("row ordering — anchor first, alternating outward", () => {
  test("middle anchor alternates row-before, row-after, expanding outward", () => {
    // 5 rows, anchor=2 → [2, 1, 3, 0, 4]. Rows are tall and scroll-adjacent,
    // so alternation keeps the next-likely scroll target near the front of
    // the queue regardless of scroll direction.
    expect(orderedRowsAroundAnchor(5, 2)).toEqual([2, 1, 3, 0, 4]);
  });

  test("near-top anchor exhausts before-rows then continues with after-rows", () => {
    expect(orderedRowsAroundAnchor(5, 1)).toEqual([1, 0, 2, 3, 4]);
  });

  test("returns an empty list for a zero-row grid", () => {
    expect(orderedRowsAroundAnchor(0, 0)).toEqual([]);
  });
});

// ─── contract: target sequence walks rows in scroll-priority order ──────────

function makeFakeRowData(cols: number): RowData {
  const imgs = Array.from({ length: cols }, () => {
    const img = { src: "https://example.com/x.webp" } as unknown as HTMLImageElement;
    return img;
  });
  return {
    rowDiv: {} as HTMLDivElement,
    sizer: {} as HTMLImageElement,
    imgs,
    adjustRowAR: () => {},
  };
}

function makeFakeComp(opts: {
  rows: number;
  cols: number;
  currentRow: number;
  currentCol: number;
}): Comp {
  return {
    numCols: opts.cols,
    numRows: opts.rows,
    currentRow: opts.currentRow,
    currentCol: opts.currentCol,
    allRowData: Array.from({ length: opts.rows }, () => makeFakeRowData(opts.cols)),
    // The function under test reads numCols, currentRow, currentCol, and
    // allRowData[].imgs; the rest are shims so the Comp shape type-checks.
    compDiv: {} as HTMLDivElement,
    container: {} as HTMLElement,
    sourceNames: null,
    visibleCols: Array.from({ length: opts.cols }, (_, i) => i),
    colBrightness: [],
    colGammaCheck: [],
    colContrast: [],
    bgLoadAll: () => false,
    setBgLoadAll: () => {},
    triggerBgLoad: () => {},
    setColumn: () => {},
    setSourceVisible: () => {},
    setRow: () => {},
    updateNavMap: () => {},
    close: () => {},
  };
}

describe("comp target sequence — anchor cell, anchor row, then neighbor rows", () => {
  test("anchor cell (currentRow, currentCol) leads the sequence", () => {
    const comp = makeFakeComp({ rows: 3, cols: 4, currentRow: 1, currentCol: 2 });
    const targets = orderedCompImageTargetsByAnchor(comp);
    expect(targets[0]).toMatchObject({ row: 1, col: 2 });
  });

  test("anchor row is exhausted before any other row begins", () => {
    const comp = makeFakeComp({ rows: 3, cols: 4, currentRow: 1, currentCol: 2 });
    const targets = orderedCompImageTargetsByAnchor(comp);
    // First 4 entries are all row 1, in column order (anchor, left, right).
    expect(targets.slice(0, 4).map((t) => ({ row: t.row, col: t.col }))).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 3 },
    ]);
  });

  test("full 3×4 sequence matches the documented anchor-first contract", () => {
    // Single source of truth for the contract: a future contributor reading
    // this can see the exact emission order without piecing it together from
    // two separate ordering functions.
    const comp = makeFakeComp({ rows: 3, cols: 4, currentRow: 1, currentCol: 2 });
    const targets = orderedCompImageTargetsByAnchor(comp);
    const sequence = targets.map((t) => [t.row, t.col]);
    expect(sequence).toEqual([
      // Anchor row (row 1) first, columns: anchor → left → right.
      [1, 2], [1, 1], [1, 0], [1, 3],
      // Row 0 (one above the anchor) next.
      [0, 2], [0, 1], [0, 0], [0, 3],
      // Row 2 (one below the anchor) last.
      [2, 2], [2, 1], [2, 0], [2, 3],
    ]);
  });

  test("alternates upward/downward as you move out from a centered anchor", () => {
    // Single-column grid keeps the comparison about rows alone.
    const comp = makeFakeComp({ rows: 5, cols: 1, currentRow: 2, currentCol: 0 });
    expect(
      orderedCompImageTargetsByAnchor(comp).map((t) => t.row),
    ).toEqual([2, 1, 3, 0, 4]);
  });

  test("cells with no src are dropped before they reach the queue", () => {
    const comp = makeFakeComp({ rows: 1, cols: 3, currentRow: 0, currentCol: 1 });
    comp.allRowData[0].imgs[0] = { src: "" } as unknown as HTMLImageElement;
    expect(
      orderedCompImageTargetsByAnchor(comp).map((t) => t.col),
    ).toEqual([1, 2]);
  });
});

// ─── contract: anchor partitioning isolates the visible cell(s) ────────────

describe("anchor partitioning — visible cell(s) separated from the rest", () => {
  test("single comp: only (currentRow, currentCol) is treated as an anchor", () => {
    const comp = makeFakeComp({ rows: 2, cols: 2, currentRow: 0, currentCol: 1 });
    const { anchors, rest } = partitionAnchorTargets(
      orderedCompImageTargetsByAnchor(comp),
    );
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({ row: 0, col: 1 });
    for (const t of rest) {
      expect(t.row === 0 && t.col === 1).toBe(false);
    }
  });

  test("multiple comps contribute one anchor each, preserved in order", () => {
    const compA = makeFakeComp({ rows: 1, cols: 2, currentRow: 0, currentCol: 0 });
    const compB = makeFakeComp({ rows: 1, cols: 2, currentRow: 0, currentCol: 1 });
    const { anchors, rest } = partitionAnchorTargets([
      ...orderedCompImageTargetsByAnchor(compA),
      ...orderedCompImageTargetsByAnchor(compB),
    ]);
    expect(anchors).toHaveLength(2);
    expect(anchors.map((a) => a.comp)).toEqual([compA, compB]);
    expect(rest).toHaveLength(2);
  });
});

// ─── contract: yieldToBrowserPaint waits one full paint cycle ───────────────

describe("yieldToBrowserPaint — paint barrier between anchor and queue", () => {
  test("with requestAnimationFrame defined, resolves after two rAFs", async () => {
    // The double-rAF pattern is what guarantees the browser has actually
    // painted between the two awaits: rAF #1 fires before paint, rAF #2
    // fires after that paint, so when the promise resolves the prior
    // style.filter set has been visibly composited.
    const originalRaf = (globalThis as { requestAnimationFrame?: unknown })
      .requestAnimationFrame;
    let rafCalls = 0;
    let resolved = false;
    let resolveRaf2: (() => void) | null = null;
    (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: () => void) => {
      rafCalls++;
      if (rafCalls === 1) {
        // Fire rAF #1 immediately so the nested rAF gets queued.
        cb();
      } else {
        // Hold rAF #2 — until it fires, the promise must not resolve.
        resolveRaf2 = cb;
      }
      return rafCalls;
    };
    try {
      const promise = yieldToBrowserPaint().then(() => {
        resolved = true;
      });
      await Promise.resolve(); // let microtasks settle
      expect(rafCalls).toBe(2);
      expect(resolved).toBe(false);
      resolveRaf2!();
      await promise;
      expect(resolved).toBe(true);
    } finally {
      (globalThis as Record<string, unknown>).requestAnimationFrame =
        originalRaf as () => void;
    }
  });

  test("falls back to setTimeout(0) when requestAnimationFrame is undefined", async () => {
    // Bun's unit-test environment has no requestAnimationFrame; the
    // fallback keeps applyAnchorsThenQueue's contract honored in tests.
    const originalRaf = (globalThis as { requestAnimationFrame?: unknown })
      .requestAnimationFrame;
    delete (globalThis as Record<string, unknown>).requestAnimationFrame;
    try {
      const start = Date.now();
      await yieldToBrowserPaint();
      // setTimeout(0) → typically a couple of ms at most; just assert it
      // resolves promptly rather than blocking.
      expect(Date.now() - start).toBeLessThan(100);
    } finally {
      if (originalRaf !== undefined) {
        (globalThis as Record<string, unknown>).requestAnimationFrame =
          originalRaf as () => void;
      }
    }
  });
});

// ─── contract: anchor-first scheduling (the chroma/luma fix) ────────────────

describe("anchor-first scheduling — visible image filters before background", () => {
  test("the anchor's apply completes before any queue item starts", async () => {
    // The pre-fix bug: four concurrent workers raced the anchor against
    // background targets, so a slow detectCS() could leave the visible
    // image unfiltered while off-screen ones updated first. The contract
    // is now strict: every anchor finishes before the queue ticks.
    const order: string[] = [];

    await applyAnchorsThenQueue(
      ["a"],
      [1, 2, 3, 4],
      4,
      () => true,
      async () => {
        order.push("anchor-start");
        await new Promise((r) => setTimeout(r, 20));
        order.push("anchor-end");
      },
      async (n) => {
        order.push(`queue-${n}`);
      },
    );

    expect(order[0]).toBe("anchor-start");
    expect(order[1]).toBe("anchor-end");
    expect(order.slice(2).sort()).toEqual(["queue-1", "queue-2", "queue-3", "queue-4"]);
  });

  test("multi-comp anchors are processed sequentially before any queue work", async () => {
    const order: string[] = [];
    await applyAnchorsThenQueue(
      ["a1", "a2"],
      [1, 2],
      2,
      () => true,
      async (a) => {
        order.push(`${a}-start`);
        await new Promise((r) => setTimeout(r, 5));
        order.push(`${a}-end`);
      },
      async (n) => {
        order.push(`q${n}`);
      },
    );
    const a1End = order.indexOf("a1-end");
    const a2Start = order.indexOf("a2-start");
    const queueStart = order.findIndex((o) => o.startsWith("q"));
    expect(a1End).toBeLessThan(a2Start);
    expect(order.indexOf("a2-end")).toBeLessThan(queueStart);
  });

  test("yieldBetween runs between the anchors and any queue work", async () => {
    // Production passes yieldToBrowserPaint here so the active image's
    // filter actually composites before the queue ties up the main thread.
    const order: string[] = [];
    await applyAnchorsThenQueue(
      ["a"],
      [1, 2],
      2,
      () => true,
      async () => { order.push("anchor"); },
      async (n) => { order.push(`queue-${n}`); },
      async () => { order.push("yield"); },
    );
    expect(order[0]).toBe("anchor");
    expect(order[1]).toBe("yield");
    expect(order.slice(2).sort()).toEqual(["queue-1", "queue-2"]);
  });

  test("yieldBetween is skipped when there is no anchor to paint", async () => {
    // Page-image-only syncs have no anchor; paying the rAF cost there would
    // be pure latency.
    let yieldRan = false;
    await applyAnchorsThenQueue(
      [],
      [1],
      1,
      () => true,
      async () => {},
      async () => {},
      async () => {
        yieldRan = true;
      },
    );
    expect(yieldRan).toBe(false);
  });

  test("stops at the anchor if a newer sync supersedes mid-flight", async () => {
    const calls: string[] = [];
    let allow = true;
    await applyAnchorsThenQueue(
      ["only-anchor"],
      [1, 2, 3],
      2,
      () => allow,
      async (a) => {
        calls.push(`anchor-${a}`);
        allow = false;
      },
      async (n) => {
        calls.push(`queue-${n}`);
      },
    );
    expect(calls).toEqual(["anchor-only-anchor"]);
  });

  test("stops between the yield and the queue if the sync goes stale", async () => {
    const calls: string[] = [];
    let stale = false;
    await applyAnchorsThenQueue(
      ["a"],
      [1, 2],
      2,
      () => !stale,
      async () => { calls.push("anchor"); },
      async (n) => { calls.push(`queue-${n}`); },
      async () => {
        calls.push("yield");
        stale = true;
      },
    );
    expect(calls).toEqual(["anchor", "yield"]);
  });
});

// ─── contract: production pipeline composes the primitives correctly ────────

describe("pipeline integration — orderedCompImageTargetsByAnchor → partition → queue", () => {
  test("the anchor target paints first when chained through the production sequence", async () => {
    // This roundtrip is the test that would have caught the original bug
    // end-to-end at the primitive layer. It uses the exact data shapes
    // production passes through, not abstract strings/numbers.
    const comp = makeFakeComp({ rows: 2, cols: 3, currentRow: 0, currentCol: 1 });
    const targets = orderedCompImageTargetsByAnchor(comp);
    const { anchors, rest } = partitionAnchorTargets(targets);

    const seen: Array<{ row: number; col: number; phase: "anchor" | "queue" }> = [];
    await applyAnchorsThenQueue(
      anchors,
      rest,
      4,
      () => true,
      async (a) => {
        // Hold the anchor briefly so any racing queue worker would lose.
        await new Promise((r) => setTimeout(r, 10));
        seen.push({ row: a.row, col: a.col, phase: "anchor" });
      },
      async (t: CompImageFilterTarget) => {
        seen.push({ row: t.row, col: t.col, phase: "queue" });
      },
    );

    expect(seen[0]).toEqual({ row: 0, col: 1, phase: "anchor" });
    expect(seen.filter((s) => s.phase === "queue")).toHaveLength(targets.length - 1);
  });
});

// ─── contract: bounded queue caps concurrency and respects cancellation ─────

describe("bounded queue — concurrency cap and mid-flight cancellation", () => {
  test("never runs more than `concurrency` workers at once", async () => {
    // Deterministic gate: every callback waits on a promise we control.
    // The previous setTimeout-based test was timing-sensitive and could
    // race on slow CI. Now we resolve gates one at a time and observe the
    // in-flight count directly.
    const concurrency = 3;
    const total = 6;
    const gates: Array<() => void> = [];
    const ready: Array<Promise<void>> = [];
    let inFlight = 0;
    let peak = 0;

    for (let i = 0; i < total; i++) {
      ready.push(new Promise<void>((resolve) => gates.push(resolve)));
    }

    const queuePromise = runBoundedFilterQueue(
      Array.from({ length: total }, (_, i) => i),
      concurrency,
      () => true,
      async (i) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await ready[i];
        inFlight--;
      },
    );

    // Let workers spin up and grab their first tasks.
    await new Promise((r) => setTimeout(r, 5));
    expect(inFlight).toBe(concurrency);

    // Release tasks one at a time; the queue should immediately pick up
    // the next, holding in-flight steady at the cap.
    for (let i = 0; i < total; i++) {
      gates[i]();
      // Give the queue a turn to schedule the next worker.
      await new Promise((r) => setTimeout(r, 1));
    }
    await queuePromise;
    expect(peak).toBe(concurrency);
  });

  test("stops dispatching once shouldApply returns false", async () => {
    const calls: number[] = [];
    let remaining = 2;
    await runBoundedFilterQueue([1, 2, 3, 4, 5], 1, () => remaining > 0, async (n) => {
      calls.push(n);
      remaining--;
    });
    expect(calls.length).toBeLessThan(5);
  });

  test("no-ops on an empty target list", async () => {
    let called = false;
    await runBoundedFilterQueue([], 4, () => true, async () => {
      called = true;
    });
    expect(called).toBe(false);
  });
});
