// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  comp.pics setup                                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import type { Grid } from "../grid";
import { activeComps } from "../filters/zoom";
import { openWithDummyWrapper } from "../viewer";

interface ComppicsData {
  imageUrls?: unknown;
  totalColumns?: unknown;
  totalRows?: unknown;
  imageNames?: unknown;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEditing(): boolean {
  const el = document.activeElement;
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    !!(el as HTMLElement | null)?.isContentEditable
  );
}

export function isComppicsNativeHotkey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;

  switch (e.code) {
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown":
    case "Digit0":
    case "Digit1":
    case "Digit2":
    case "Digit3":
    case "Digit4":
    case "Digit5":
    case "Digit6":
    case "Digit7":
    case "Digit8":
    case "Digit9":
    case "KeyS":
    case "Equal":
    case "NumpadAdd":
    case "Minus":
    case "NumpadSubtract":
    case "KeyR":
      return true;
    default:
      return false;
  }
}

function blockComppicsHotkeys(e: KeyboardEvent): void {
  if (activeComps.length === 0) return;
  if (isEditing()) return;
  if (!isComppicsNativeHotkey(e)) return;

  e.preventDefault();
  e.stopImmediatePropagation();
}

function installComppicsHotkeyBlocker(): void {
  window.addEventListener("keydown", blockComppicsHotkeys, true);
  window.addEventListener("keyup", blockComppicsHotkeys, true);
}

function fullImageUrl(path: string, pageUrl: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL("/uploads/" + path.replace(/^\/+/, ""), pageUrl).href;
}

function columnNames(imageNames: string[], totalColumns: number, totalRows: number): string[] | undefined {
  if (imageNames.length < totalColumns) return undefined;

  const names: string[] = [];
  for (let col = 0; col < totalColumns; col++) {
    const first = imageNames[col].trim();
    if (!first) return undefined;

    const base = first.replace(new RegExp(String.raw`\s*-\s*1$`), "").trim();
    const isNumberedColumn =
      totalRows > 1 &&
      base &&
      imageNames.length >= totalColumns * totalRows &&
      Array.from({ length: totalRows }, (_, row) => imageNames[row * totalColumns + col]?.trim()).every(
        (name, row) => name === `${base}-${row + 1}` || name === `${base} - ${row + 1}`,
      );

    names.push(isNumberedColumn ? base : first);
  }

  return names;
}

function extractArray(scriptText: string, key: string): string[] | null {
  const match = scriptText.match(new RegExp(`${key}\\s*:\\s*(\\[[\\s\\S]*?\\])`));
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    return isStringArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractNumber(scriptText: string, key: string): number | null {
  const match = scriptText.match(new RegExp(`${key}\\s*:\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

function readComppicsDataFromScripts(): ComppicsData | null {
  for (const script of document.scripts) {
    const text = script.textContent || "";
    if (!text.includes("compareData")) continue;

    const imageUrls = extractArray(text, "imageUrls");
    const imageNames = extractArray(text, "imageNames");
    const totalColumns = extractNumber(text, "totalColumns");
    const totalRows = extractNumber(text, "totalRows");
    if (imageUrls && totalColumns && totalRows) return { imageUrls, imageNames, totalColumns, totalRows };
  }
  return null;
}

function readComppicsData(): ComppicsData | null {
  try {
    const data = Function("return typeof compareData !== 'undefined' ? compareData : null")() as
      | ComppicsData
      | null;
    if (data) return data;
  } catch {
    // Fall through to script text parsing; userscript sandboxes can differ.
  }

  return readComppicsDataFromScripts();
}

export function parseComppicsComparisonData(data: ComppicsData, pageUrl: string = location.href): Grid | null {
  const imageUrls = data.imageUrls;
  const totalColumns = data.totalColumns;
  const totalRows = data.totalRows;
  const imageNames = data.imageNames;

  if (!isStringArray(imageUrls)) return null;
  if (typeof totalColumns !== "number" || !Number.isInteger(totalColumns) || totalColumns < 2) return null;
  if (typeof totalRows !== "number" || !Number.isInteger(totalRows) || totalRows < 1) return null;
  if (imageUrls.length !== totalColumns * totalRows) return null;

  const rows = [];
  for (let row = 0; row < totalRows; row++) {
    rows.push(
      imageUrls.slice(row * totalColumns, (row + 1) * totalColumns).map((url) => ({
        full: fullImageUrl(url, pageUrl),
      })),
    );
  }

  const names = isStringArray(imageNames) ? columnNames(imageNames, totalColumns, totalRows) : null;

  return { rows, numCols: totalColumns, names: names || null };
}

export function comppicsButtonProps(kind: "desktop" | "mobile"): { className: string; innerHTML: string } {
  return {
    className: kind === "mobile" ? "btn btn-secondary w-100 mb-2" : "nav-link d-inline-block",
    innerHTML: '<i class="fa fa-search"></i> YAComp Viewer',
  };
}

function createComppicsButton(kind: "desktop" | "mobile"): HTMLAnchorElement {
  const props = comppicsButtonProps(kind);
  const btn = document.createElement("a");
  btn.href = "#";
  btn.innerHTML = props.innerHTML;
  btn.className = props.className;
  btn.title = "Open comparison viewer";
  btn.style.cursor = "pointer";
  btn.dataset.yacompComppics = "true";
  return btn;
}

function attachButton(button: HTMLAnchorElement, grid: Grid): void {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openWithDummyWrapper(grid);
  });
}

export function setupComppics(): void {
  if (!/(?:^|\.)comp\.pics$/.test(location.hostname)) return;
  if (!/^\/compare\//.test(location.pathname)) return;
  installComppicsHotkeyBlocker();
  if (document.querySelector("[data-yacomp-comppics]")) return;

  const data = readComppicsData();
  if (!data) return;

  const grid = parseComppicsComparisonData(data);
  if (!grid) return;

  const desktopButton = createComppicsButton("desktop");
  attachButton(desktopButton, grid);

  const shareButton = document.querySelector("#shareBBCodeBtn");
  if (shareButton?.parentNode) {
    shareButton.parentNode.insertBefore(desktopButton, shareButton.nextSibling);
  } else {
    const bar = document.querySelector(".metadata-container") || document.querySelector(".navbar .container-fluid");
    if (bar) bar.appendChild(desktopButton);
    else document.querySelector(".comparison-container")?.before(desktopButton);
  }

  const mobileShareButton = document.querySelector("#mobileShareBBCodeBtn");
  if (!mobileShareButton?.parentNode) return;

  const mobileButton = createComppicsButton("mobile");
  attachButton(mobileButton, grid);
  mobileShareButton.parentNode.insertBefore(mobileButton, mobileShareButton.nextSibling);
}
