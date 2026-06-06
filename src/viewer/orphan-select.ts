// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Orphan-select overlay — drop the odd shot(s) from an indivisible set      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// When a comparison-thread OP posts a screenshot count that doesn't divide by
// the column count (80402: 37 shots for a 2-wide AUS/GBR set — the poster
// dropped one), we can't pair the shots up cleanly, and the misalignment can be
// anywhere (a *middle* drop shifts every pair after it). Rather than guess,
// "Show comparison" opens this overlay: a thumbnail grid laid out in the
// intended column count so the row where the columns stop matching is visible.
// The user clicks the odd shot(s) to drop, and once the remainder divides, Enter
// / "Build comparison" re-flows the kept shots and opens the real comparison.

import type { Grid, GridCell } from "../grid/types";
import { getShadowRoot } from "../ui/shadow";
import { injectCSS } from "../ui/css";
import { buildComparison } from "./comparison";

/** Show the drop-the-odd-shot picker for an indivisible `grid`, then build the
 *  comparison from the kept shots. */
export function openOrphanSelect(grid: Grid, container: HTMLElement, link: HTMLElement): void {
  injectCSS();
  const root = getShadowRoot();
  const cells = grid.rows.flat();
  const numCols = grid.numCols;
  const excluded = new Set<number>();

  const overlay = document.createElement("div");
  overlay.className = "_scf_orphan_select";

  const header = document.createElement("div");
  header.className = "_scf_os_header";
  const hint = document.createElement("div");
  hint.className = "_scf_os_hint";
  const buildBtn = document.createElement("button");
  buildBtn.type = "button";
  buildBtn.className = "_scf_os_build";
  buildBtn.textContent = "Build comparison";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "_scf_os_cancel";
  cancelBtn.textContent = "Cancel";
  header.append(hint, buildBtn, cancelBtn);

  const gridEl = document.createElement("div");
  gridEl.className = "_scf_os_grid";
  gridEl.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;

  cells.forEach((cell: GridCell, i) => {
    const thumb = document.createElement("div");
    thumb.className = "_scf_os_thumb";
    const img = document.createElement("img");
    img.src = cell.thumb || cell.full;
    img.loading = "lazy";
    const badge = document.createElement("div");
    badge.className = "_scf_os_badge";
    badge.textContent = "✕";
    thumb.append(img, badge);
    thumb.addEventListener("click", () => {
      if (excluded.has(i)) excluded.delete(i);
      else excluded.add(i);
      thumb.classList.toggle("_scf_os_excluded", excluded.has(i));
      update();
    });
    gridEl.appendChild(thumb);
  });

  const remaining = (): number => cells.length - excluded.size;
  const divides = (): boolean => remaining() > 0 && remaining() % numCols === 0;

  function update(): void {
    const rem = remaining();
    const over = rem % numCols;
    if (divides()) {
      hint.textContent = `${rem} shots ÷ ${numCols} columns ✓ — press Enter to build the comparison.`;
      buildBtn.disabled = false;
    } else {
      hint.textContent =
        `${rem} shots don't divide into ${numCols} columns — ` +
        `click the odd shot${over === 1 ? "" : "(s)"} to drop ${over} more.`;
      buildBtn.disabled = true;
    }
  }

  function cleanup(): void {
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
  }
  function confirm(): void {
    if (!divides()) return;
    const kept = cells.filter((_, i) => !excluded.has(i));
    const rows: GridCell[][] = [];
    for (let i = 0; i < kept.length; i += numCols) rows.push(kept.slice(i, i + numCols));
    cleanup();
    buildComparison({ rows, numCols, names: grid.names, anchorEl: grid.anchorEl }, container, link);
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Enter") { e.preventDefault(); confirm(); }
    else if (e.key === "Escape") { e.preventDefault(); cleanup(); }
  }

  buildBtn.addEventListener("click", confirm);
  cancelBtn.addEventListener("click", cleanup);
  document.addEventListener("keydown", onKey, true);

  overlay.append(header, gridEl);
  root.appendChild(overlay);
  update();
}
