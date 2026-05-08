// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  slow.pics setup                                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { openWithDummyWrapper } from "../viewer";
import type { GridCell } from "../grid";

declare global {
  interface Window {
    unsafeWindow?: Window;
    collection?: {
      comparisons: {
        images: {
          name: string;
          publicFileName: string;
        }[];
      }[];
    };
  }
}

export function openSlowPicsViewer(): boolean {
  const col = (window.unsafeWindow || window).collection;
  if (!col || !col.comparisons || !col.comparisons.length) return false;
  const comps = col.comparisons;
  const names = comps[0].images.map((im) =>
    im.name.replace(/^\([BIP]\) /, "").replaceAll(".", " ")
  );
  const numCols = names.length;
  const rows: GridCell[][] = comps.map((c) =>
    c.images.map((im) => ({ full: "https://i.slow.pics/" + im.publicFileName }))
  );
  openWithDummyWrapper({ rows, numCols, names });
  return true;
}

export function setupSlowPics(): void {
  if (!/slow\.pics\/c\//.test(location.href)) return;

  function addButton(parent: Element, className: string): void {
    const btn = document.createElement("a");
    btn.textContent = "🔍";
    btn.className = className;
    btn.title = "Open comparison viewer (V)";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => openSlowPicsViewer());
    parent.appendChild(btn);
  }

  const bar = document.querySelector(".footer-position .container-fluid");
  if (bar) addButton(bar, "btn btn-success ms-2");

  const navImages = document.querySelector("#images")?.parentElement;
  if (navImages) {
    const navBtn = document.createElement("a");
    navBtn.className = "nav-link d-inline-block";
    navBtn.textContent = "🔍";
    navBtn.title = "Open comparison viewer (V)";
    navBtn.style.cursor = "pointer";
    navBtn.addEventListener("click", () => openSlowPicsViewer());
    navImages.after(navBtn);
  }
}
