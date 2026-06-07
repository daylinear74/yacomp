import { describe, test, expect } from "bun:test";
import { forumAnchorsAreComparison } from "../../src/sites/hdbits";

// The HDBits forum custom-comparison builder should appear only in Comparisons-
// forum threads by default. A comparison thread's H1 breadcrumbs to the
// Comparisons forum (forumid=40):
//   <h1>…<a href="/forums/viewforum?forumid=40">Comparisons</a> &gt; [Comparisons] …</h1>
describe("forumAnchorsAreComparison — comparison-thread detection", () => {
  test("true when a breadcrumb anchor links to the Comparisons forum (forumid=40)", () => {
    expect(forumAnchorsAreComparison([
      { href: "/forums/viewforum?forumid=40", text: "Comparisons" },
    ])).toBe(true);
  });

  test("true when an anchor's text is 'Comparisons' even if the id differs", () => {
    expect(forumAnchorsAreComparison([
      { href: "/forums/viewforum?forumid=99", text: " Comparisons " },
    ])).toBe(true);
  });

  test("false for an ordinary (non-comparison) forum thread", () => {
    expect(forumAnchorsAreComparison([
      { href: "/forums/viewforum?forumid=12", text: "General Discussion" },
    ])).toBe(false);
  });

  test("false with no forum anchors in the breadcrumb", () => {
    expect(forumAnchorsAreComparison([])).toBe(false);
  });

  test("forumid match is exact — forumid=400 is not a Comparisons thread", () => {
    expect(forumAnchorsAreComparison([
      { href: "/forums/viewforum?forumid=400", text: "Some Other Forum" },
    ])).toBe(false);
  });
});
