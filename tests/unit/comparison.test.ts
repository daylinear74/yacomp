import { describe, test, expect } from "bun:test";
import {
  calcScrollSpacerHeights,
  formatLoadingCellLabel,
  insertLinkAfter,
  resetWheelZoomGesture,
  type WheelZoomGestureState,
} from "../../src/viewer/comparison";

describe("formatLoadingCellLabel", () => {
  test("shows a normalized title with 1-based column and row coordinates", () => {
    expect(formatLoadingCellLabel("  BD   Remux  ", 0, 3)).toBe("BD Remux (C1, R4)");
  });

  test("falls back to a numbered source when the title is absent", () => {
    expect(formatLoadingCellLabel(null, 2, 0)).toBe("Source 3 (C3, R1)");
  });
});

describe("calcScrollSpacerHeights", () => {
  test("computes spacers for centered scrolling", () => {
    const result = calcScrollSpacerHeights(800, 400, 300);
    expect(result.top).toBe(200);
    expect(result.bottom).toBe(250);
  });
  test("clamps to zero when row taller than half viewport", () => {
    const result = calcScrollSpacerHeights(400, 600, 600);
    expect(result.top).toBe(0);
    expect(result.bottom).toBe(0);
  });
});

describe("resetWheelZoomGesture", () => {
  test("clears anchor and timer", () => {
    const state: WheelZoomGestureState = {
      anchor: { comp: {} as any, rowIdx: 0, currentRowIdx: 0, rowXRatio: 0.5, rowYRatio: 0.5, viewportX: 100, viewportY: 100, scrollTopBounds: "content" },
      resetTimer: setTimeout(() => {}, 9999),
    };
    resetWheelZoomGesture(state);
    expect(state.anchor).toBeNull();
    expect(state.resetTimer).toBeNull();
  });
});

describe("insertLinkAfter", () => {
  test("preserves insertion order when multiple links share a heading", () => {
    type FakeNode = {
      nodeName: string;
      nodeType: number;
      textContent?: string;
      className?: string;
      parentNode: FakeParent | null;
      nextSibling: FakeNode | null;
    };
    type FakeParent = {
      children: FakeNode[];
      insertBefore(node: FakeNode, before: FakeNode | null): void;
    };
    const refreshLinks = (children: FakeNode[]) => {
      for (let i = 0; i < children.length; i++) {
        children[i].nextSibling = children[i + 1] ?? null;
      }
    };
    const parent: FakeParent = {
      children: [],
      insertBefore(node, before) {
        const existing = this.children.indexOf(node);
        if (existing >= 0) this.children.splice(existing, 1);
        const index = before ? this.children.indexOf(before) : -1;
        node.parentNode = this;
        this.children.splice(index >= 0 ? index : this.children.length, 0, node);
        refreshLinks(this.children);
      },
    };
    const node = (nodeName: string, textContent = "", className = ""): FakeNode => ({
      nodeName,
      nodeType: 1,
      textContent,
      className,
      parentNode: parent,
      nextSibling: null,
    });
    const heading = node("STRONG", "Source vs Encode");
    const br = node("BR");
    parent.children.push(heading, br);
    refreshLinks(parent.children);
    const oldDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: { createElement: (name: string) => FakeNode } }).document = {
      createElement: (name: string) => node(name.toUpperCase()),
    };
    const first = node("A", "first", "_scf_comp_link");
    const second = node("A", "second", "_scf_comp_link");

    try {
      insertLinkAfter(heading as unknown as Node, first as unknown as HTMLElement);
      insertLinkAfter(heading as unknown as Node, second as unknown as HTMLElement);
    } finally {
      (globalThis as { document?: unknown }).document = oldDocument;
    }

    const linkTexts = parent.children
      .filter((child) => child.nodeName === "A")
      .map((link) => link.textContent);
    expect(linkTexts).toEqual(["first", "second"]);
  });
});
