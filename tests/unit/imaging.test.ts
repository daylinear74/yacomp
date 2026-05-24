import { describe, test, expect } from "bun:test";
import {
  orderedRowsAroundAnchor,
  orderedColumnsAroundAnchor,
  orderedCompImageTargetsByAnchor,
  partitionAnchorTargets,
  applyAnchorsThenQueue,
  runBoundedFilterQueue,
  type CompImageFilterTarget,
} from "../../src/filters/imaging";
import type { Comp, RowData } from "../../src/viewer/types";

// ─── ordering ────────────────────────────────────────────────────────────────

describe("orderedColumnsAroundAnchor", () => {
  test("anchor first, then expand leftward, then rightward", () => {
    // Visible source is at col 2. The filter should run on col 2, then
    // sweep leftward (1, 0), then rightward (3, 4) — biased toward the
    // image the user is most likely to glance at next.
    expect(orderedColumnsAroundAnchor(5, 2)).toEqual([2, 1, 0, 3, 4]);
  });

  test("anchor at the left edge expands only rightward", () => {
    expect(orderedColumnsAroundAnchor(4, 0)).toEqual([0, 1, 2, 3]);
  });

  test("anchor at the right edge expands only leftward", () => {
    expect(orderedColumnsAroundAnchor(4, 3)).toEqual([3, 2, 1, 0]);
  });

  test("clamps anchor above range", () => {
    expect(orderedColumnsAroundAnchor(3, 99)).toEqual([2, 1, 0]);
  });

  test("clamps anchor below range", () => {
    expect(orderedColumnsAroundAnchor(3, -5)).toEqual([0, 1, 2]);
  });

  test("returns empty for a zero-column grid", () => {
    expect(orderedColumnsAroundAnchor(0, 0)).toEqual([]);
  });
});

describe("orderedRowsAroundAnchor", () => {
  test("anchor first, then alternate row-before / row-after", () => {
    expect(orderedRowsAroundAnchor(5, 2)).toEqual([2, 1, 3, 0, 4]);
  });

  test("anchor near the top exhausts after-rows once before-rows run out", () => {
    expect(orderedRowsAroundAnchor(5, 1)).toEqual([1, 0, 2, 3, 4]);
  });

  test("returns empty for a zero-row grid", () => {
    expect(orderedRowsAroundAnchor(0, 0)).toEqual([]);
  });
});

// ─── target ordering for a real comp shape ──────────────────────────────────

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
    // unused fields filled with shims; the function under test only reads
    // numCols, currentRow, currentCol, allRowData[].imgs
    compDiv: {} as HTMLDivElement,
    container: {} as HTMLElement,
    link: {} as HTMLElement,
    sourceNames: null,
    visibleCols: Array.from({ length: opts.cols }, (_, i) => i),
    navMapEl: {} as HTMLDivElement,
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

describe("orderedCompImageTargetsByAnchor", () => {
  test("anchor cell (currentRow, currentCol) is processed first", () => {
    const comp = makeFakeComp({ rows: 3, cols: 4, currentRow: 1, currentCol: 2 });
    const targets = orderedCompImageTargetsByAnchor(comp);
    expect(targets[0]).toMatchObject({ row: 1, col: 2 });
  });

  test("remaining cells of the anchor row follow next, in left-then-right order", () => {
    const comp = makeFakeComp({ rows: 3, cols: 4, currentRow: 1, currentCol: 2 });
    const targets = orderedCompImageTargetsByAnchor(comp);
    // Row 1 is processed completely before any other row.
    expect(targets.slice(0, 4).map((t) => ({ row: t.row, col: t.col }))).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 3 },
    ]);
  });

  test("after the anchor row, neighbor rows alternate before/after", () => {
    const comp = makeFakeComp({ rows: 5, cols: 1, currentRow: 2, currentCol: 0 });
    const targets = orderedCompImageTargetsByAnchor(comp);
    expect(targets.map((t) => t.row)).toEqual([2, 1, 3, 0, 4]);
  });

  test("skips cells with no src", () => {
    const comp = makeFakeComp({ rows: 1, cols: 3, currentRow: 0, currentCol: 1 });
    comp.allRowData[0].imgs[0] = { src: "" } as unknown as HTMLImageElement;
    const targets = orderedCompImageTargetsByAnchor(comp);
    expect(targets.map((t) => t.col)).toEqual([1, 2]);
  });
});

// ─── anchor partitioning ────────────────────────────────────────────────────

describe("partitionAnchorTargets", () => {
  test("separates anchor cell from the rest of the comp's targets", () => {
    const comp = makeFakeComp({ rows: 2, cols: 2, currentRow: 0, currentCol: 1 });
    const targets = orderedCompImageTargetsByAnchor(comp);
    const { anchors, rest } = partitionAnchorTargets(targets);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({ row: 0, col: 1 });
    expect(rest).toHaveLength(targets.length - 1);
    for (const t of rest) {
      expect(t.row === 0 && t.col === 1).toBe(false);
    }
  });

  test("picks up an anchor per comp when several are open", () => {
    const compA = makeFakeComp({ rows: 1, cols: 2, currentRow: 0, currentCol: 0 });
    const compB = makeFakeComp({ rows: 1, cols: 2, currentRow: 0, currentCol: 1 });
    const targets = [
      ...orderedCompImageTargetsByAnchor(compA),
      ...orderedCompImageTargetsByAnchor(compB),
    ];
    const { anchors, rest } = partitionAnchorTargets(targets);
    expect(anchors).toHaveLength(2);
    expect(anchors.map((a) => a.comp)).toEqual([compA, compB]);
    expect(rest).toHaveLength(2);
  });
});

// ─── perf: anchor-first scheduling ───────────────────────────────────────────

describe("applyAnchorsThenQueue (anchor-first guarantee)", () => {
  test("awaits every anchor before the queue starts", async () => {
    // The anchor's filter resolution holds for 20ms. If the implementation
    // races the queue alongside the anchor (the pre-fix behavior), one of the
    // queue items will fire its callback before "anchor-end" lands. By
    // recording the call order we can assert the ordering invariant without
    // measuring wall-clock time, so the test stays deterministic.
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

  test("multiple anchors are processed sequentially before the queue", async () => {
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
    // Anchors strictly serialized — a2 must wait for a1 to end.
    const a1End = order.indexOf("a1-end");
    const a2Start = order.indexOf("a2-start");
    const queueStart = order.findIndex((o) => o.startsWith("q"));
    expect(a1End).toBeLessThan(a2Start);
    expect(order.indexOf("a2-end")).toBeLessThan(queueStart);
  });

  test("bails before the queue if shouldApply turns false during the anchor", async () => {
    const calls: string[] = [];
    let allow = true;
    await applyAnchorsThenQueue(
      ["only-anchor"],
      [1, 2, 3],
      2,
      () => allow,
      async (a) => {
        calls.push(`anchor-${a}`);
        allow = false; // a newer sync supersedes us mid-flight
      },
      async (n) => {
        calls.push(`queue-${n}`);
      },
    );
    expect(calls).toEqual(["anchor-only-anchor"]);
  });

  test("no anchors falls through to the queue", async () => {
    const seen: number[] = [];
    await applyAnchorsThenQueue(
      [],
      [1, 2, 3],
      2,
      () => true,
      async () => {},
      async (n) => {
        seen.push(n);
      },
    );
    expect(seen.sort()).toEqual([1, 2, 3]);
  });

  test("yieldBetween runs after the anchors and before any queue work", async () => {
    // The yield exists so the browser can paint the anchor's filter before
    // the background queue grabs the main thread again. Asserting the order
    // (anchor → yield → queue) protects that guarantee.
    const order: string[] = [];
    await applyAnchorsThenQueue(
      ["a"],
      [1, 2],
      2,
      () => true,
      async () => {
        order.push("anchor");
      },
      async (n) => {
        order.push(`queue-${n}`);
      },
      async () => {
        order.push("yield");
      },
    );
    expect(order[0]).toBe("anchor");
    expect(order[1]).toBe("yield");
    expect(order.slice(2).sort()).toEqual(["queue-1", "queue-2"]);
  });

  test("yieldBetween is skipped when there are no anchors", async () => {
    // Without an anchor to paint, the yield is wasted latency. Verify the
    // helper still skips it (which keeps the page-image-only path snappy).
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
    // Implementation detail: there's nothing to paint, so no need to yield.
    // If a future change starts yielding anyway it would mask perf issues
    // with the page-image-only path; flip this assertion if the contract
    // intentionally changes.
    expect(yieldRan).toBe(false);
  });

  test("bails on a stale sync token after the yield", async () => {
    const calls: string[] = [];
    let stale = false;
    await applyAnchorsThenQueue(
      ["a"],
      [1, 2],
      2,
      () => !stale,
      async () => {
        calls.push("anchor");
      },
      async (n) => {
        calls.push(`queue-${n}`);
      },
      async () => {
        calls.push("yield");
        stale = true; // a newer sync arrived while the browser was painting
      },
    );
    expect(calls).toEqual(["anchor", "yield"]);
  });
});

// ─── bounded queue behavior ─────────────────────────────────────────────────

describe("runBoundedFilterQueue", () => {
  test("respects concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await runBoundedFilterQueue([1, 2, 3, 4, 5, 6], 3, () => true, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
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
