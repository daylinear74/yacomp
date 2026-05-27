import { setupKeyboard } from "../../../src/keyboard";
import { openSlowPicsViewer } from "../../../src/sites/slowpics";
import { saveConfig, resetConfig, getConfig } from "../../../src/config";
import { openSettings } from "../../../src/ui/settings";

type SlowPicsCollection = NonNullable<Window["collection"]>;

const cdnUrl = "https://i.slow.pics/";

const collection: SlowPicsCollection = {
  comparisons: [
    {
      images: [
        { name: "FRA", publicFileName: "wide-source-a.webp" },
        { name: "TWN", publicFileName: "wide-source-b.webp" },
        { name: "TWN(Gamma=0.92)", publicFileName: "wide-source-c.webp" },
      ],
    },
    {
      images: [
        { name: "FRA", publicFileName: "pillar-source-a.webp" },
        { name: "TWN", publicFileName: "pillar-source-b.webp" },
        { name: "TWN(Gamma=0.92)", publicFileName: "pillar-source-c.webp" },
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

  // Test hooks: Playwright drives these via page.evaluate. They're scoped
  // to the fixture so the production userscript doesn't expose anything.
  (window as unknown as { __yacomp: unknown }).__yacomp = {
    saveConfig,
    resetConfig,
    getConfig,
    openSettings,
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
