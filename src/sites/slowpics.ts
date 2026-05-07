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

export function setupSlowPics(): void {
  if (!/slow\.pics\/c\//.test(location.href)) return;
  const bar = document.querySelector(".footer-position .container-fluid");
  if (!bar) return;
  const btn = document.createElement("a");
  btn.textContent = "🔍";
  btn.className = "btn btn-success ms-2";
  btn.title = "Open comparison viewer";
  btn.style.cursor = "pointer";
  bar.appendChild(btn);
  btn.addEventListener("click", () => {
    const col = (window.unsafeWindow || window).collection;
    if (!col || !col.comparisons || !col.comparisons.length) return;
    const comps = col.comparisons;
    const names = comps[0].images.map((im) =>
      im.name.replace(/^\([BIP]\) /, "").replaceAll(".", " ")
    );
    const numCols = names.length;
    const rows: GridCell[][] = comps.map((c) =>
      c.images.map((im) => ({ full: "https://i.slow.pics/" + im.publicFileName }))
    );
    openWithDummyWrapper({ rows, numCols, names });
  });
}
