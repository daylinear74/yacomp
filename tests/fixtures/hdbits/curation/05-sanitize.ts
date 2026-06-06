import { readFileSync, writeFileSync } from "node:fs";

function genericizeImages(body: string): string {
  const order: string[] = [];
  const seen = new Set<string>();
  // collect hashes from thumbs, full-image hrefs, and i.hdbits png alike
  const re = /\/\/(?:t|i|img)\.hdbits\.org\/([A-Za-z0-9]{4,})(?:\.jpg|\.png)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) if (!seen.has(m[1])) (seen.add(m[1]), order.push(m[1]));
  const width = Math.max(2, String(order.length).length);
  let out = body;
  order.forEach((h, i) => {
    // skip already-generic tokens
    if (/^g\d+$/.test(h) || /^(thumb|full|sec)/.test(h)) return;
    const token = "g" + String(i + 1).padStart(width, "0");
    out = out.replace(
      new RegExp("(//(?:t|i|img)\\.hdbits\\.org/)" + h + "(?=[.\"/]|$)", "g"),
      "$1" + token,
    );
  });
  return out;
}

function sanitize(body: string): string {
  let b = genericizeImages(body);
  // strip hdbits redir.php targets (base64-encoded external URLs)
  b = b.replace(/(redir\.php\?url=)[^"'&<>\s]+/gi, "$1");
  // neutralize external (non-hdbits) image sources
  let extImg = 0;
  b = b.replace(/(<img[^>]+src=")(https?:\/\/(?!\w*\.?hdbits\.org)[^"]*)(")/gi, () => {
    extImg++;
    return `<img src="https://example.invalid/ext-img-${String(extImg).padStart(2, "0")}.jpg"`;
  });
  // neutralize external (non-hdbits) anchor hrefs
  let extLink = 0;
  b = b.replace(/(<a[^>]+href=")(https?:\/\/(?!\w*\.?hdbits\.org)[^"]*)(")/gi, (_m, p1, _u, p3) => {
    extLink++;
    return `${p1}https://example.invalid/link-${String(extLink).padStart(2, "0")}${p3}`;
  });
  // neutralize any remaining bare/text URLs to non-hdbits, non-example hosts
  b = b.replace(/https?:\/\/(?!(?:\w*\.)?hdbits\.org|example\.invalid)[^\s"'<>]+/gi, "https://example.invalid/link");
  // normalize residual @mentions and identifiers
  b = b.replace(/@[A-Za-z0-9_]{2,}/g, "@User");
  b = b.replace(/details\.php\?id=\d+/g, "details.php?id=999999");
  b = b.replace(/userdetails\.php\?id=\d+/g, "userdetails.php?id=100001");
  b = b.replace(/[?&]passkey=[A-Za-z0-9]+/gi, "");
  return b;
}

for (const file of process.argv.slice(2)) {
  const content = readFileSync(file, "utf-8");
  const m = content.match(/^(<!--[\s\S]*?-->)\s*([\s\S]*)$/);
  if (!m) {
    console.log(`${file}: no header, skipped`);
    continue;
  }
  const header = m[1];
  const body = m[2];
  const cleanedBody = sanitize(body);
  // also sanitize the notes/title inside the header (defensive)
  const cleanedHeader = header
    .replace(/@[A-Za-z0-9_]{2,}/g, "@User")
    .replace(/https?:\/\/(?!(?:\w*\.)?hdbits\.org|example\.invalid)[^\s"'<>)]+/gi, "https://example.invalid/x")
    .replace(/details\.php\?id=\d+/g, "details.php?id=999999");
  const out = cleanedHeader + "\n\n" + cleanedBody.replace(/^\n+/, "");
  if (out !== content) {
    writeFileSync(file, out.endsWith("\n") ? out : out + "\n");
    console.log(`${file}: sanitized`);
  }
}
