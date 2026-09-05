import { test, expect } from "./fixtures";
import { svgFilterDefsMarkup } from "../../src/filters/svg";

test("rendered luma, chroma, gamma, and Solar previews match numerical references", async ({ page }) => {
  const samples: number[][] = [];
  for (let gray = 0; gray < 256; gray++) samples.push([gray, gray, gray]);
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) samples.push([r, g, b]);
  const tile = 8, columns = 32, width = tile * columns, height = tile * Math.ceil(samples.length / columns);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    samples.map((s, i) => `<rect x="${i % columns * tile}" y="${Math.floor(i / columns) * tile}" width="${tile}" height="${tile}" fill="rgb(${s.join(",")})"/>`).join("") + "</svg>";
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const solar = (v: number, offset: number) => {
    const x = v + offset, m = 5.5 * Math.PI - 128 / 5;
    return clamp(127.9999 * Math.sin(-m / 4194304 * x ** 3 + 3 * m / 32768 * x ** 2 + x / 5 - Math.PI / 2) + 127.5);
  };
  const references = [
    ...[{ id: "709", weights: [.2126, .7152, .0722] }, { id: "2020", weights: [.2627, .6780, .0593] }].flatMap(({ id, weights }) => [
      { id: "scf-luma" + id, expected: (s: number[]) => Array(3).fill(s.reduce((n, v, i) => n + v * weights[i], 0)) as number[] },
      { id: "scf-chroma" + id, expected: (s: number[]) => { const y = s.reduce((n, v, i) => n + v * weights[i], 0); return s.map((v) => clamp(v - y + 255 * 112 / 219)); } },
    ]),
    ...[{ id: "srgb-bt1886", ratio: .917 }, { id: "aeqt-0p88", ratio: .88 }, { id: "legacy-mac", ratio: .818 }].map(({ id, ratio }) => ({
      id: "scf-gamma-mismatch-" + id,
      expected: (s: number[]) => { const y = s.reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0) / 255; return s.map((v) => clamp(v + 255 * (y ** (1 / ratio) - y))); },
    })),
    ...[1, 2].map((passes) => ({ id: "scf-s" + passes, expected: (s: number[]) => s.map((v, i) => {
      for (let p = 0; p < passes; p++) v = solar(v, [0, -5, 5][i]);
      return v;
    }) })),
  ];

  await page.setContent(`<style>html,body{margin:0}img{display:block}</style><svg style="position:absolute;width:0;height:0">${svgFilterDefsMarkup()}</svg><img id="probe" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`);
  const image = page.locator("#probe");
  await image.evaluate((el) => (el as HTMLImageElement).decode());
  for (const reference of references) {
    await image.evaluate((el, id) => { (el as HTMLElement).style.filter = `url(#${id})`; }, reference.id);
    const screenshot = await image.screenshot();
    // Decode the actual rendered PNG in the browser so no extra image library
    // or platform-specific profile is required by the test suite.
    const actual = await page.evaluate(async ({ png, samples, columns, tile }) => {
      const img = new Image(); img.src = png; await img.decode();
      const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
      const context = canvas.getContext("2d")!; context.drawImage(img, 0, 0);
      const data = context.getImageData(0, 0, img.width, img.height).data;
      return Array.from({ length: samples }, (_, i) => {
        const x = i % columns * tile + tile / 2, y = Math.floor(i / columns) * tile + tile / 2;
        return Array.from(data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));
      });
    }, { png: "data:image/png;base64," + screenshot.toString("base64"), samples: samples.length, columns, tile });
    const largestError = Math.max(...samples.flatMap((sample, i) => reference.expected(sample).map((v, c) => Math.abs(Math.round(v) - actual[i][c]))));
    expect(largestError, reference.id).toBeLessThanOrEqual(1);
  }
});
