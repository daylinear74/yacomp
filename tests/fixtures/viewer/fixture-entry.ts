import { setupKeyboard } from "../../../src/keyboard";
import { openSlowPicsViewer } from "../../../src/sites/slowpics";

type SlowPicsCollection = NonNullable<Window["collection"]>;

const cdnUrl = "https://i.slow.pics/";

const collection: SlowPicsCollection = {
  comparisons: [
    {
      images: [
        { name: "FRA", publicFileName: "8CyYMgrL.webp" },
        { name: "TWN", publicFileName: "9zRl7mrI.webp" },
        { name: "TWN(Gamma=0.92)", publicFileName: "sMJeu22E.webp" },
      ],
    },
    {
      images: [
        { name: "FRA", publicFileName: "mQL84APQ.webp" },
        { name: "TWN", publicFileName: "wWZNai7p.webp" },
        { name: "TWN(Gamma=0.92)", publicFileName: "0MqqnHpt.webp" },
      ],
    },
    {
      images: [
        { name: "FRA", publicFileName: "t1PYwp1N.webp" },
        { name: "TWN", publicFileName: "DxJo6hAN.webp" },
        { name: "TWN(Gamma=0.92)", publicFileName: "FTME17xN.webp" },
      ],
    },
    {
      images: [
        { name: "FRA", publicFileName: "JpmCoNAR.webp" },
        { name: "TWN", publicFileName: "esMGXZGg.webp" },
        { name: "TWN(Gamma=0.92)", publicFileName: "ZLUzmC8l.webp" },
      ],
    },
    {
      images: [
        { name: "FRA", publicFileName: "lImy62QF.webp" },
        { name: "TWN", publicFileName: "lEKLpTHk.webp" },
        { name: "TWN(Gamma=0.92)", publicFileName: "rqmBusGu.webp" },
      ],
    },
    {
      images: [
        { name: "FRA", publicFileName: "4Dbs9IVj.webp" },
        { name: "TWN", publicFileName: "zf4D1RMM.webp" },
        { name: "TWN(Gamma=0.92)", publicFileName: "wDVo001a.webp" },
      ],
    },
  ],
};

function imageUrl(publicFileName: string): string {
  return cdnUrl + publicFileName;
}

function renderFixture(): void {
  const rowsRoot = document.getElementById("fixture-grid");
  const status = document.getElementById("fixture-status");
  if (!rowsRoot || !status) return;

  rowsRoot.replaceChildren();
  collection.comparisons.forEach((comparison) => {
    const rowEl = document.createElement("div");
    rowEl.className = "fixture-row";

    comparison.images.forEach((image) => {
      const link = document.createElement("a");
      link.className = "frame";
      link.href = imageUrl(image.publicFileName);
      link.target = "_blank";
      link.rel = "noreferrer";

      const img = document.createElement("img");
      img.src = imageUrl(image.publicFileName);
      img.alt = image.name;
      img.referrerPolicy = "no-referrer-when-downgrade";

      link.appendChild(img);
      rowEl.appendChild(link);
    });
    rowsRoot.appendChild(rowEl);
  });

  const sourceCount = collection.comparisons[0]?.images.length ?? 0;
  status.textContent = `${collection.comparisons.length} comparisons x ${sourceCount} sources`;
}

function boot(): void {
  setupKeyboard();

  window.collection = collection;
  renderFixture();

  const openButton = document.getElementById("open-viewer");
  openButton?.addEventListener("click", () => openSlowPicsViewer());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
