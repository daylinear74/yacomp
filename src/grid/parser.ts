// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Grid parsing                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import type { GridCell, Grid } from "./types";
import {
  hasVsOrPipe, hasExplicitComparison, splitNames, looksLikeNames,
  findComparisonNames, namesFromLeadingStructuredLabels, namesFromHeadings, isOriginalPost,
  foldTrailingSize, isNonSourceLabel, isUrlLabel, isFooterLabel, tidyName, isMultiSourceLabel,
} from "./names";

export function hdbFull(src: string): string {
  return src.replace(
    /\/\/t(\.hdbits\.org\/[^.?]+)\.jpg(\?.*)?$/i,
    "//i$1.png",
  );
}

interface GroupsResult {
  groups: GridCell[][];
  groupLabels: (string | null)[];
  groupLabelEls: (ChildNode | null)[];
}

function collectTextLines(node: ChildNode, lines: string[]): void {
  if (node.nodeName === "BR") {
    lines.push("");
    return;
  }
  if (node.nodeType === 3) {
    lines[lines.length - 1] += node.textContent || "";
    return;
  }
  for (const child of node.childNodes) {
    collectTextLines(child, lines);
  }
}

function textAfterLastBreak(el: Element): string | null {
  const lines = [""];
  collectTextLines(el, lines);
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  return nonEmpty[nonEmpty.length - 1] || null;
}

function labelTextFromNode(node: ChildNode): string | null {
  let t = node.nodeType === 1
    ? textAfterLastBreak(node as Element)
    : (node.textContent || "").trim();
  if (t && node.nodeType === 1 && (node as Element).matches("label.label_showhide")) {
    t = t.replace(/\s*\[(?:show|hide)\]\s*$/i, "");
  }
  // A forum quote attribution ("Username wrote:") is not a source label.
  if (t && isNonSourceLabel(t)) return null;
  return t ? t.replace(/:$/, "").trim() : null;
}

function isExternalTextLink(anchor: HTMLAnchorElement): boolean {
  return !anchor.querySelector("img") && anchor.origin !== location.origin;
}

// Signature/tracker images embedded in a post (most commonly a FlagCounter
// banner in the user's sig or a hidden block) are NOT comparison screenshots.
// Counting them as grid cells throws off the column-count divisibility — e.g. a
// clean 60-image 5-wide grid + 1 FlagCounter image = 61, which divides by
// nothing — so they are excluded from group collection.
const NON_SCREENSHOT_IMG_RE = /(?:\/\/|\.)flagcounter\.com\//i;
function isNonScreenshotImg(img: HTMLImageElement): boolean {
  return NON_SCREENSHOT_IMG_RE.test(img.src);
}

/** Walk container's childNodes, collecting BR-separated image groups with labels.
 *  Images in `excludeImgs` (already claimed by an inner container's grid) are
 *  skipped, so an enclosing container's parse doesn't re-emit them. */
function collectGroups(container: Element, excludeImgs: Set<HTMLImageElement>): GroupsResult | null {
  const groups: GridCell[][] = [];
  const groupLabels: (string | null)[] = [];
  const groupLabelEls: (ChildNode | null)[] = [];
  let group: GridCell[] = [];
  let pendingLabel: string | null = null;
  let pendingLabelEl: ChildNode | null = null;
  // A source label can be split across sibling nodes on one line — most often a
  // release name in <strong> followed by " - AC3 5.1 - 1.06 GiB" as plain text.
  // Accumulate consecutive label nodes on the same line; a <br> ends the line so
  // the next line REPLACES the label (last line before the images wins).
  let lineBroken = true;

  const visit = (node: ChildNode): void => {
    if (node.nodeName === "BR") {
      if (group.length) {
        groups.push(group);
        groupLabels.push(pendingLabel);
        groupLabelEls.push(pendingLabelEl);
        group = [];
        pendingLabel = null;
        pendingLabelEl = null;
      }
      lineBroken = true;
    } else if (node.nodeName === "A") {
      const anchor = node as HTMLAnchorElement;
      const img = anchor.querySelector("img") as HTMLImageElement | null;
      if (img && !excludeImgs.has(img) && !isNonScreenshotImg(img)) {
        const isHdb = /\/\/t\.hdbits\.org\//i.test(img.src);
        const full = isHdb
          ? hdbFull(img.src)
          : /\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i.test(anchor.href)
            ? anchor.href
            : img.src;
        group.push({ thumb: img.src, full, a: anchor, img });
      } else if (!group.length && isExternalTextLink(anchor)) {
        // A heading followed by an external comparison URL describes that
        // linked comparison, not arbitrary inline screenshots that follow it.
        pendingLabel = null;
        pendingLabelEl = null;
      }
    } else if (node.nodeType === 1 && (node as Element).querySelector("img")) {
      for (const child of node.childNodes) visit(child);
    } else if (!group.length && node.nodeName !== "TABLE") {
      // Technical-information tables such as BDInfo contain slash-delimited
      // codec metadata; their last line is not a label for later screenshots.
      const t = labelTextFromNode(node);
      if (t) {
        // Accumulate ONLY the "<strong>release</strong> - AC3 5.1 - size" shape:
        // inline text immediately following a BOLD element on the same line.
        const prevBold = pendingLabelEl?.nodeName === "STRONG" || pendingLabelEl?.nodeName === "B";
        const accumulate =
          !!pendingLabel && !lineBroken && node.nodeType === 3 && prevBold;
        if (accumulate) {
          pendingLabel = `${pendingLabel} ${t}`;
        } else {
          pendingLabel = t;
          pendingLabelEl = node;
        }
        lineBroken = false;
      }
    }
  };

  for (const node of container.childNodes) {
    visit(node);
  }
  if (group.length) {
    groups.push(group);
    groupLabels.push(pendingLabel);
    groupLabelEls.push(pendingLabelEl);
  }
  if (!groups.length) return null;
  const allImages = groups.flat();
  if (allImages.length < 2) return null;
  return { groups, groupLabels, groupLabelEls };
}

/** When groups carry their own "X vs Y" / "X | Y" labels, each becomes its own
 *  grid. Only an explicit vs/pipe separator counts — a dash/comma in a label is
 *  treated as part of one source name (e.g. "release - AC3 5.1 - 1.06 GiB"),
 *  so such per-group labels stay as single columns of one transposed grid. */
function buildMultiCompGrids(groups: GridCell[][], groupLabels: (string | null)[], groupLabelEls: (ChildNode | null)[]): Grid[] | null {
  const labeledGroups = groupLabels
    .map((label, index) => ({ label, index }))
    .filter((g): g is { label: string; index: number } => !!g.label && hasVsOrPipe(g.label));
  if (!labeledGroups.length) return null;
  if (groups.length > 1 && labeledGroups.length === 1) return null;
  // Single-comparison-as-per-source-groups shape: EVERY group has its own
  // label and NONE uses an explicit vs/|/ ÷ separator (the labels are single
  // source names, often "release - AC3 5.1 - size"). That is one comparison
  // with a group per source, not several comparisons — defer to the transpose
  // path so the per-group labels become the columns of a single grid.
  if (
    groups.length >= 2 &&
    labeledGroups.length === groups.length &&
    !labeledGroups.some((g) => hasExplicitComparison(g.label))
  ) {
    return null;
  }

  const results: Grid[] = [];
  for (let i = 0; i < labeledGroups.length; i++) {
    const { label, index } = labeledGroups[i];
    const nextIndex = labeledGroups[i + 1]?.index ?? groups.length;
    const sectionGroups = groups.slice(index, nextIndex);
    const imgs = sectionGroups.flat();
    if (imgs.length < 2) continue;

    const names = splitNames(label);
    if (!names || !looksLikeNames(names))
      continue;

    const shaped = reshapeGrid(sectionGroups, imgs, names);
    if (!shaped) continue;
    results.push({
      rows: shaped.gridRows,
      numCols: shaped.numCols,
      names: finalizeNames(names),
      anchorEl: groupLabelEls[index],
    });
  }
  return results.length ? results : null;
}

function singleGroupLabelInfo(groupLabels: (string | null)[], groupLabelEls: (ChildNode | null)[]): { names: string[]; anchorEl: ChildNode | null } | null {
  const labels = groupLabels
    .map((label, index) => ({ label, index }))
    .filter((g): g is { label: string; index: number } => !!g.label && hasVsOrPipe(g.label));
  if (labels.length !== 1) return null;
  const names = splitNames(labels[0].label);
  return looksLikeNames(names) ? { names, anchorEl: groupLabelEls[labels[0].index] } : null;
}

/** Final pass on a grid's names: drop a name set that is entirely bare numbers
 *  (frame/set indices like ["2","3","6"…] mis-read as sources — show the grid
 *  with no labels instead), otherwise tidy each name. */
function finalizeNames(names: string[] | null): string[] | null {
  if (!names || !names.length) return names;
  if (names.every((n) => /^\d+$/.test(n.trim()))) return null;
  return names.map(tidyName);
}

function leadingBoldLabelInfo(container: Element): { names: string[]; anchorEl: Element } | null {
  const bolds: Element[] = [];
  for (const node of container.childNodes) {
    if (node.nodeName === "A" && (node as Element).querySelector("img")) break;
    if (node.nodeName === "STRONG" || node.nodeName === "B") {
      const t = node.textContent!.trim();
      if (t && !isNonSourceLabel(t)) bolds.push(node as Element);
    }
  }
  if (bolds.length < 2) return null;
  const names = bolds.map((b) => b.textContent!.trim()).filter(Boolean);
  if (!looksLikeNames(names)) return null;
  return { names, anchorEl: bolds[bolds.length - 1] };
}

/** A single leading element whose text itself carries a vs/pipe split,
 *  e.g. "US (…) vs FRE (…) vs JPN (…)". This is a genuine local comparison
 *  label even when it sits among non-source labels (e.g. "Short description:"
 *  or a trailing comparison URL) that suppressed the structured-label path.
 *  The label is matched on any wrapping element (strong, font, span, div…),
 *  not just a bare <strong>, so font/span-wrapped headings are still caught. */
const VS_LABEL_WRAPPER = new Set(["STRONG", "B", "FONT", "SPAN", "U", "I", "EM"]);
function leadingVsLabelInfo(container: Element): { names: string[]; anchorEl: Element } | null {
  for (const node of container.childNodes) {
    if (node.nodeName === "A" && (node as Element).querySelector("img")) break;
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.querySelector("img")) break;
    // Only a bold-ish inline heading qualifies — never a TABLE/P/DIV block
    // (e.g. a comma-laden BDInfo table would otherwise split into junk).
    if (!VS_LABEL_WRAPPER.has(el.nodeName)) continue;
    const isBold = el.nodeName === "STRONG" || el.nodeName === "B" || !!el.querySelector("strong, b");
    if (!isBold) continue;
    const t = el.textContent!.trim();
    if (!t || isNonSourceLabel(t) || !hasVsOrPipe(t)) continue;
    const names = splitNames(t);
    if (looksLikeNames(names)) return { names, anchorEl: el };
  }
  return null;
}

// Per project ruling, ONLY an explicit "vs" / "vs." / "v." / "|" separator gives
// a leading line title-precedence. A slash, comma, dash or "×" does NOT — those
// routinely appear inside BDInfo codec lines ("MPEG-4 AVC / 27191 kbps"), byte
// counts ("614,127,007 bytes") and prose ("1.78:1 / 1.85:1"), which must never
// outrank the real per-group/heading labels.
const VS_BAR_RE = /\bvs?\.\s|\bvs\s|\||[<>]{2,}/i;
// A continuation line of a multi-line vs-list, e.g. "DE (…) vs. KR (…)<br>vs. US (…)".
const VS_CONTINUATION_RE = /^\s*(?:vs?\.|\|)\s/i;

/** True when a split "name" is really prose — a paragraph that merely MENTIONS a
 *  comparison ("UK vs. DE: There are lots of parts of the film… on DE. For
 *  reference…"), not a title. A real source name is short and tokenised; a
 *  sentence boundary (".", "!", "?" then a capitalised word) or an absurd length
 *  marks prose. Long release names ("…7.1 (33454 kbps) (with NGU Sharp)") have
 *  no sentence boundary, so they pass. */
export function looksLikeProse(parts: string[]): boolean {
  // A sentence boundary (".", "!", "?" then a capitalised word) or a comma
  // followed by a lowercase sentence connector (", the latter is better, but…")
  // marks prose. A length cap is deliberately NOT used — legit release names run
  // long ("Beetlejuice 1988 2160p UHD BluRay HEVC TrueHD Atmos 7.1 (71.2mb/s) …")
  // and a comma before a CAPITAL ("Disc Title: X, The", "DE, ES, FR") is fine.
  return parts.some((p) => {
    const t = p.trim();
    return /[.!?]["')\]]?\s+[A-Z]/.test(t) ||
      /,\s+(?:the|a|an|but|and|so|or|latter|former|it|this|which|that)\b/.test(t);
  });
}

/** Highest-precedence label source: a leading line (before the first screenshot)
 *  that carries an explicit "vs"/"v."/"|" separator. Per project ruling, such a
 *  line always wins over per-group comma labels and NOTE:/nb: preamble prose. It
 *  captures hyperlinked source names (1202: "<a>JP (Pony Canyon)…</a> vs. <a>UK
 *  (Anime Ltd)…</a>"), inline-wrapped headings (0478: "<strong>Source vs
 *  encode</strong>"), and vs-lists split across <br> lines (2022: "DE … vs.
 *  KR …<br>vs. US …"). */
function leadingComparisonNames(container: Element): { names: string[]; anchorEl: ChildNode | null } | null {
  type Line = { text: string; el: ChildNode | null; external: boolean };
  const raw: Line[] = [{ text: "", el: null, external: false }];
  for (const node of container.childNodes) {
    if (node.nodeName === "BR") { raw.push({ text: "", el: null, external: false }); continue; }
    if (node.nodeName === "IMG") break;
    if (node.nodeName === "A" && (node as Element).querySelector("img")) break;
    if (node.nodeType === 1 && (node as Element).querySelector("img")) break;
    const cur = raw[raw.length - 1];
    if (node.nodeName === "A") {
      const at = (node.textContent || "").trim();
      // A "see it here" pointer whose text is a footer label ("Slow.pics")
      // means the heading's screenshots live at that EXTERNAL comparison (007) —
      // mark the line so it can't supply inline titles. A BARE URL ("( Outside
      // link: https://slow.pics/c/… )") is just a mirror aside, NOT an external
      // boundary — skip its text but still let the local vs-line win (2503). A
      // hyperlinked source NAME ("<a>JP (Pony Canyon) AVC…</a>") contributes.
      if (isFooterLabel(at)) { cur.external = true; continue; }
      if (isUrlLabel(at)) continue;
    }
    cur.text += node.textContent || "";
    // Anchor the "Show comparison" link to the LAST element of the heading line
    // (e.g. the trailing "US" source), so it is inserted AFTER the whole title
    // rather than splitting it ("GER [link] vs US" — 74778).
    if (node.nodeType === 1) cur.el = node;
    // A block element ends the line (its siblings start a new one).
    if (node.nodeType === 1 && /^(?:DIV|P|PRE|TABLE|BLOCKQUOTE|UL|OL)$/.test(node.nodeName)) {
      raw.push({ text: "", el: null, external: false });
    }
  }
  // Merge a continuation line ("vs. US …") into the line it continues.
  const lines: Line[] = [];
  for (const ln of raw) {
    if (lines.length && VS_CONTINUATION_RE.test(ln.text)) {
      lines[lines.length - 1].text += ` ${ln.text.trim()}`;
      lines[lines.length - 1].external ||= ln.external;
      // Anchor on the LAST element of the merged heading (the trailing source),
      // so the "Show comparison" link follows the whole title (74778).
      if (ln.el) lines[lines.length - 1].el = ln.el;
    } else {
      lines.push({ ...ln });
    }
  }
  // Nearest-to-images line wins among explicit vs/v./| lines. A vs-heading is
  // disqualified when an external comparison link ("Slow.pics") sits BETWEEN it
  // and the screenshots — those screenshots belong to that external comparison
  // (007), not to this heading.
  let sawExternalAfter = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].external) { sawExternalAfter = true; continue; }
    if (sawExternalAfter) continue;
    // Drop a showhide affordance marker ("Source vs Encode [show]" → "… Encode").
    const t = lines[i].text.replace(/\s*\[(?:show|hide)\]\s*/gi, " ").trim();
    if (!t || isNonSourceLabel(t) || !VS_BAR_RE.test(t)) continue;
    const names = splitNames(t);
    if (names.length >= 2 && looksLikeNames(names) && !looksLikeProse(names)) {
      return { names, anchorEl: lines[i].el };
    }
  }
  return null;
}

// A real per-source label is short and clean ("JPN BD", "USA", "Sony Pictures |
// Germany") — never a quote/paragraph/URL (2715).
function isCleanSourceLabel(t: string): boolean {
  return t.length > 0 && t.length <= 40 && !/https?:\/\//i.test(t) &&
    !/\bquote\b/i.test(t) && !looksLikeProse([t]) && !isNonSourceLabel(t);
}

/** Collect per-source labels that each precede an image-LESS documentation block
 *  (a "Hidden text" showhide, or a BDInfo `<table>` / Quote header), within
 *  `scope` and up to `stopAt`. The screenshots are a separate flat block; the
 *  labels are the columns (the BDInfo is ignored). */
function sourceLabelsBeforeDocBlocks(scope: Element, stopAt: Node | null): { names: string[]; anchorEl: Element | null } | null {
  const labels: string[] = [];
  let lastEl: Element | null = null;
  let pending = "";
  let lastLine = ""; // last non-empty line — the label may sit a <br> above the block
  for (const node of scope.childNodes) {
    if (node === stopAt) break;
    if (node.nodeName === "BR") { const t = pending.trim(); if (t) lastLine = t; pending = ""; continue; }
    if (node.nodeType === 3) { pending += node.textContent || ""; continue; }
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.nodeName === "IMG" || (el.nodeName === "A" && el.querySelector("img"))) break; // screenshots
    const docBlock = !el.querySelector("img") &&
      (!!el.querySelector?.("label.label_showhide") || el.matches?.("table, p.sub"));
    if (docBlock) {
      const t = (pending.trim() || lastLine).replace(/[:\s]+$/, "").trim();
      if (t && isCleanSourceLabel(t) && labels[labels.length - 1] !== t) { labels.push(t); lastEl = el; }
      pending = ""; lastLine = "";
    } else if (el.querySelector?.("img")) {
      break; // an inline image block before this — not the pattern
    } else {
      pending += el.textContent || "";
    }
  }
  return labels.length >= 2 && looksLikeNames(labels) ? { names: labels, anchorEl: lastEl } : null;
}

/** Sources documented as per-source labels before image-less blocks, with the
 *  screenshots in a separate flat block: "JPN BD: [Hidden text]…" (77086, labels
 *  in the parent of the image wrapper) or "USA<Quote BDInfo> CAN<Quote BDInfo>"
 *  (80662, labels alongside the screenshots in the same container). */
function leadingShowhideSourceLabels(container: Element): { names: string[]; anchorEl: Element | null } | null {
  return sourceLabelsBeforeDocBlocks(container, null) ??
    (container.parentElement ? sourceLabelsBeforeDocBlocks(container.parentElement, container) : null);
}

/** True when the container carries a slow.pics comparison link (direct or via an
 *  HDBits /redir.php wrapper whose visible text is the slow.pics URL). */
function hasSlowPicsLink(container: Element): boolean {
  for (const a of container.querySelectorAll("a[href]")) {
    if (/slow\.pics/i.test(a.getAttribute("href") || "") || /slow\.pics/i.test(a.textContent || "")) {
      return true;
    }
  }
  return false;
}

function stableGridColumnCount(groups: GridCell[][]): number | null {
  const firstLen = groups[0]?.length ?? 0;
  if (
    groups.length >= 2 &&
    firstLen >= 2 &&
    groups.every((g) => g.length === firstLen)
  ) {
    return firstLen;
  }
  return null;
}

function leadingStructuredLabelInfo(container: Element, groups: GridCell[][]): { names: string[]; anchorEl: Element } | null {
  const numCols = stableGridColumnCount(groups);
  if (!numCols) return null;
  return namesFromLeadingStructuredLabels(container, numCols);
}

function hasLocalNonNameHeading(groupLabels: (string | null)[]): boolean {
  const firstImageLabel = groupLabels.find((label) => !!label);
  if (!firstImageLabel) return false;
  if (/^\d+$/.test(firstImageLabel)) return false;
  if (/^(?:screenshots?|screenshot\s+comparison|comparison)$/i.test(firstImageLabel)) return false;
  return !looksLikeNames(splitNames(firstImageLabel));
}

function trimTrailingLabeledSectionAfterSingleGridLabel(collected: GroupsResult): GroupsResult {
  const gridLabelIndexes = collected.groupLabels
    .map((label, index) => ({ label, index }))
    .filter((g): g is { label: string; index: number } => !!g.label && hasVsOrPipe(g.label))
    .map((g) => g.index);
  if (gridLabelIndexes.length !== 1) return collected;

  let sawUnlabeledGridRow = false;
  let sectionIndex = -1;
  for (let i = gridLabelIndexes[0] + 1; i < collected.groupLabels.length; i++) {
    if (!collected.groupLabels[i]) {
      sawUnlabeledGridRow = true;
    } else if (sawUnlabeledGridRow) {
      sectionIndex = i;
      break;
    }
  }

  if (sectionIndex < 0) return collected;
  return {
    groups: collected.groups.slice(0, sectionIndex),
    groupLabels: collected.groupLabels.slice(0, sectionIndex),
    groupLabelEls: collected.groupLabelEls.slice(0, sectionIndex),
  };
}

/** Reshape groups into a grid based on name count */
export function reshapeGrid(groups: GridCell[][], allImages: GridCell[], names: string[] | null): { numCols: number; gridRows: GridCell[][] } | null {
  const firstLen = groups[0].length;
  const isProperGrid =
    groups.length >= 2 &&
    firstLen >= 2 &&
    groups.every((g) => g.length === firstLen);

  let numCols: number, gridRows: GridCell[][];

  if (isProperGrid) {
    if (
      names &&
      names.length >= 2 &&
      names.length !== firstLen &&
      allImages.length % names.length === 0
    ) {
      numCols = names.length;
      if (names.length === groups.length) {
        gridRows = [];
        for (let r = 0; r < firstLen; r++) {
          gridRows.push(groups.map((g) => g[r]));
        }
      } else {
        gridRows = [];
        for (let i = 0; i < allImages.length; i += numCols) {
          gridRows.push(allImages.slice(i, i + numCols));
        }
      }
    } else {
      numCols = firstLen;
      gridRows = groups;
    }
  } else {
    if (
      names &&
      names.length >= 2 &&
      allImages.length >= names.length &&
      allImages.length % names.length === 0
    ) {
      numCols = names.length;
    } else {
      return null;
    }
    gridRows = [];
    for (let i = 0; i < allImages.length; i += numCols) {
      gridRows.push(allImages.slice(i, i + numCols));
    }
  }

  if (!gridRows.length || numCols < 2) return null;
  return { numCols, gridRows };
}

export function parseGrid(container: Element, excludeImgs: Set<HTMLImageElement> = new Set()): Grid[] | null {
  let collected = collectGroups(container, excludeImgs);
  if (!collected) return null;
  let { groups, groupLabels, groupLabelEls } = collected;

  const multiComp = buildMultiCompGrids(groups, groupLabels, groupLabelEls);
  if (multiComp) return multiComp;

  collected = trimTrailingLabeledSectionAfterSingleGridLabel(collected);
  ({ groups, groupLabels, groupLabelEls } = collected);

  // Prefer per-group text labels over page-level headings.
  // Numeric-only labels (1, 2, 37…) are frame/row indices, not source names —
  // each group is already a row, so skip them and let findComparisonNames run.
  let names: string[] | null = null;
  let anchorEl: ChildNode | null = null;
  const total = groups.flat().length;
  // Highest precedence: a leading line with an explicit "vs"/"v."/"|" comparison.
  // Only when its column count divides the screenshots — otherwise it is a
  // sub-section line ("2160p UHD vs 1080p BD") in a wider grid (e.g. a 3-wide
  // "UHD/new BD/old BD"), and the real per-group/heading label must still win.
  const leadCmp = leadingComparisonNames(container);
  if (leadCmp && total % leadCmp.names.length === 0) {
    names = leadCmp.names;
    anchorEl = leadCmp.anchorEl;
  }
  if (!names && groupLabels.length >= 2 && groupLabels.every((l) => l)) {
    const allNumeric = groupLabels.every((l) => /^\d+$/.test(l!));
    // Each label must be a SINGLE source for the transpose (one group per
    // source). If a label is itself a multi-source list (e.g. a section heading
    // "Source (Carlotta | FRA), Geek, TayTO (TWN)"), these groups are separate
    // comparisons, not columns — don't transpose them.
    const anyMultiSource = (groupLabels as string[]).some(isMultiSourceLabel);
    if (!allNumeric && !anyMultiSource) names = (groupLabels as string[]).map(foldTrailingSize);
  }
  if (!names) {
    const singleLabel = singleGroupLabelInfo(groupLabels, groupLabelEls);
    if (singleLabel) {
      names = singleLabel.names;
      anchorEl = singleLabel.anchorEl;
    }
  }
  if (!names) {
    const leadingBold = leadingBoldLabelInfo(container);
    if (leadingBold) {
      names = leadingBold.names;
      anchorEl = leadingBold.anchorEl;
    }
  }
  if (!names) {
    const structured = leadingStructuredLabelInfo(container, groups);
    if (structured) {
      names = structured.names;
      anchorEl = structured.anchorEl;
    }
  }
  if (!names) {
    const leadingVs = leadingVsLabelInfo(container);
    if (leadingVs) {
      names = leadingVs.names;
      anchorEl = leadingVs.anchorEl;
    }
  }
  if (!names) {
    const showhideLabels = leadingShowhideSourceLabels(container);
    if (showhideLabels && total % showhideLabels.names.length === 0) {
      names = showhideLabels.names;
      anchorEl = showhideLabels.anchorEl;
    }
  }
  if (!names && hasLocalNonNameHeading(groupLabels)) {
    // A non-name local heading normally suppresses the grid. But when the only
    // alternative is a slow.pics link, the ORIGINAL POSTER's H1 title is the
    // preferred source (owner ruling): use it when its column count divides the
    // screenshots, else leave it for the slow.pics rescue. A block with NO
    // slow.pics link stays suppressed (e.g. a non-comparison gallery, 057).
    const h1 = isOriginalPost(container) && hasSlowPicsLink(container) ? namesFromHeadings() : null;
    if (h1 && total % h1.length === 0 && looksLikeNames(h1)) {
      names = h1;
    } else {
      return null;
    }
  }
  if (!names) {
    names = findComparisonNames(container);
  }
  // Fall-through to the topic H1: if the chosen local label does NOT divide the
  // screenshots but the original poster's H1 title DOES, the H1 is the real
  // comparison (owner ruling, 2625: a 3-wide "GBR Blu-ray vs GER Blu-ray vs GBR
  // Blu-ray" gamma sub-note over a 4-wide "GBR vs USA vs GER vs AUS" grid).
  if (names && total % names.length !== 0 && isOriginalPost(container)) {
    const h1 = namesFromHeadings();
    if (h1 && total % h1.length === 0 && looksLikeNames(h1)) {
      names = h1;
      anchorEl = null;
    }
  }

  const shaped = reshapeGrid(groups, groups.flat(), names);
  if (!shaped) return null;

  // Fallback: match strong count to numCols
  if (!names) {
    let el: Element | null = container;
    for (let up = 0; up < 5 && el; up++, el = el.parentElement) {
      const strongs = el.querySelectorAll("strong");
      if (!strongs.length) continue;
      const candidates = [...strongs]
        .map((s) => s.textContent!.trim())
        .filter((t) => t && !/^(comparison|preview|screenshots?)$/i.test(t));
      if (candidates.length === shaped.numCols) {
        names = candidates;
        break;
      }
    }
  }

  // No usable source label: fall back to defaults. By HDBits convention a
  // 3-wide comparison is Source / Filtered / Encode; any other width is just
  // numbered Source 1 … Source N.
  let finalNames = finalizeNames(names);
  if (!finalNames) {
    finalNames = shaped.numCols === 3
      ? ["Source", "Filtered", "Encode"]
      : Array.from({ length: shaped.numCols }, (_, i) => `Source ${i + 1}`);
  }

  return [{ rows: shaped.gridRows, numCols: shaped.numCols, names: finalNames, anchorEl }];
}

let _grids: { grid: Grid; container: Element }[] | null = null;

function hdbGridParseContainer(container: Element): Element {
  const hiddenContent = container.closest("div.div_showhide");
  const label = hiddenContent?.previousElementSibling;
  if (
    !hiddenContent ||
    !label?.matches("label.label_showhide") ||
    !/(?:\||\bvs\.?\s)/i.test(label.textContent || "")
  ) {
    return container;
  }

  return hiddenContent.parentElement || container;
}

export function getGrids(preClaimed?: Set<HTMLImageElement>): { grid: Grid; container: Element }[] {
  if (_grids) return _grids;
  _grids = [];
  const seen = new Set<Element>();
  // Images already emitted in a grid. Containers are visited in image-document
  // order, so an inner wrapper (a <strong>/showhide block of screenshots) is
  // parsed before the enclosing block; the enclosing parse then EXCLUDES those
  // images, so it only emits grids for the still-unclaimed screenshots instead
  // of re-emitting the inner comparison. `preClaimed` seeds this with images the
  // caller handles elsewhere (e.g. slow.pics-linked comparisons), so getGrids
  // skips them entirely.
  const claimed = new Set<HTMLImageElement>(preClaimed);
  for (const img of document.querySelectorAll(
    'img[src*="//t.hdbits.org/"]',
  )) {
    if (claimed.has(img as HTMLImageElement)) continue;
    const a = img.closest("a");
    if (!a) continue;
    const c = a.parentElement;
    if (!c) continue;
    const parseContainer = hdbGridParseContainer(c);
    if (seen.has(parseContainer)) continue;
    seen.add(parseContainer);
    const parsed = parseGrid(parseContainer, claimed);
    if (parsed) {
      for (const grid of parsed) {
        for (const cell of grid.rows.flat()) {
          if (cell.img) claimed.add(cell.img);
        }
        _grids.push({ grid, container: c });
      }
    }
  }
  return _grids;
}
