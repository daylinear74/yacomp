// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Name-finding strategies                                                  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Reject pipe/vs splits that look like metadata (years, runtimes, dates)
const META_RE = /^(\d{4}|\d+\s*min|[a-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})$/i;
export function looksLikeNames(parts: string[]): boolean {
  return parts.length >= 2 && !parts.some((p) => META_RE.test(p.trim()));
}

const VS_RE = /\s+vs\.?\s+/i;
const VS_TEST = /\bvs\.?\s/i;
export function splitNames(text: string): string[] {
  const sep = text.includes("|") ? "|" : VS_RE;
  return text.split(sep).map((n) => n.trim()).filter(Boolean);
}
export function hasVsOrPipe(text: string): boolean {
  return text.includes("|") || VS_TEST.test(text);
}

// ── Name-finding sub-strategies ──

/** Scan bold tags (reverse order) for vs/pipe labels, skipping links */
export function namesFromBoldTags(tags: Element[]): string[] | null {
  for (let i = tags.length - 1; i >= 0; i--) {
    if (tags[i].closest("a")) continue;
    const text = tags[i].textContent!.trim();
    if (hasVsOrPipe(text)) {
      const p = splitNames(text);
      if (looksLikeNames(p)) return p;
    }
  }
  return null;
}

/** Strategy 1: preceding siblings' bold tags */
export function namesFromSiblings(container: Element): string[] | null {
  let sib = container.previousElementSibling;
  for (let steps = 0; steps < 8 && sib; steps++, sib = sib.previousElementSibling) {
    if (sib.nodeName === "BR") continue;
    const tags: Element[] = sib.matches?.("strong, b") ? [sib] : [];
    tags.push(...(sib.querySelectorAll?.("strong, b") || []));
    const found = namesFromBoldTags(tags);
    if (found) return found;
  }
  return null;
}

/** Strategy 2: container's leading text (text nodes + non-image links) */
export function namesFromLeadingText(container: Element): string[] | null {
  let leadingText = "";
  for (const node of container.childNodes) {
    if (node.nodeName === "A") {
      if ((node as Element).querySelector("img")) break;
      leadingText += node.textContent;
    } else if (node.nodeType === 3) {
      leadingText += node.textContent;
    } else if (node.nodeName === "BR") {
      leadingText += " ";
    } else {
      break;
    }
  }
  leadingText = leadingText.trim();
  if (leadingText && hasVsOrPipe(leadingText)) {
    const parts = splitNames(leadingText);
    if (looksLikeNames(parts)) return parts;
  }
  return null;
}

/** Strategy 2b: color-coded span labels */
export function namesFromColorSpans(container: Element): string[] | null {
  const colorSpans = [...container.querySelectorAll('span[style*="color"]')];
  if (colorSpans.length >= 2) {
    const csNames = colorSpans
      .map((s) => s.textContent!.trim())
      .filter(Boolean);
    if (csNames.length >= 2) return csNames;
  }
  return null;
}

/** Strategy 2c: bold/strong tags that are direct children of the container
 *  appearing before the first image link — these are inline source labels */
export function namesFromLeadingBoldTags(container: Element): string[] | null {
  const bolds: string[] = [];
  for (const node of container.childNodes) {
    if (node.nodeName === "A" && (node as Element).querySelector("img")) break;
    if (node.nodeName === "STRONG" || node.nodeName === "B") {
      const t = node.textContent!.trim();
      if (t) bolds.push(t);
    }
  }
  return bolds.length >= 2 ? bolds : null;
}

/** Strategy 3: bold tags in ancestor elements */
export function namesFromAncestors(container: Element): string[] | null {
  let el: Element | null = container;
  for (let up = 0; up < 8 && el; up++, el = el.parentElement) {
    const tags = [...el.querySelectorAll("strong, b")];
    if (tags.length) {
      const found = namesFromBoldTags(tags);
      if (found) return found;
    }
  }
  return null;
}

/** Strip movie title prefix from an H1 heading text */
function stripTitlePrefix(text: string): string {
  const dash = text.lastIndexOf(" - ");
  if (dash >= 0) return text.substring(dash + 3).trim();
  const ym = text.match(/\(\d{4}\)\s*/);
  if (ym) {
    const after = text.substring(ym.index! + ym[0].length).trim();
    if (after) return after;
  }
  return text;
}

/** Strategy 4: H1 headings (forum comparison threads) */
export function namesFromHeadings(): string[] | null {
  for (const h1 of document.querySelectorAll("h1")) {
    let text = h1.textContent!.trim();
    const gt = text.lastIndexOf(">");
    if (gt >= 0) text = text.substring(gt + 1).trim();

    if (text.includes("|")) {
      const label = stripTitlePrefix(text);
      if (label.includes("|")) {
        const parts = splitNames(label);
        if (parts.every((p) => p) && looksLikeNames(parts)) return parts;
      }
    }

    if (VS_TEST.test(text)) {
      const parts = text.split(VS_RE).map((n) => n.trim());
      parts[0] = stripTitlePrefix(parts[0]);
      if (parts.every((p) => p) && looksLikeNames(parts)) return parts;
    }
  }
  return null;
}

export function findComparisonNames(container: Element): string[] | null {
  return (
    namesFromSiblings(container) ||
    namesFromLeadingText(container) ||
    namesFromColorSpans(container) ||
    namesFromLeadingBoldTags(container) ||
    namesFromAncestors(container) ||
    namesFromHeadings()
  );
}
