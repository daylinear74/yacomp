// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  slow.pics source — fetch a comparison's authoritative column titles +    ║
// ║  grid size from a slow.pics/c/<key> link found on a tracker page.         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// A slow.pics comparison page server-renders `var collection = {…JSON…}` inline.
// `collection.comparisons` are the grid ROWS; `comparisons[0].images[].name` are
// the COLUMN titles (source names); the column count is the grid width. This is
// authoritative, so when a tracker post can't infer a comparison's column count
// from the DOM, we fetch the linked slow.pics collection instead.

export interface SlowPicsImage {
  name: string;
  publicFileName: string;
  width?: number | null;
  height?: number | null;
}
export interface SlowPicsComparison {
  key?: string;
  name?: string;
  images: SlowPicsImage[];
}
export interface SlowPicsCollection {
  key?: string;
  name?: string;
  comparisons: SlowPicsComparison[];
}

export interface SlowPicsGridInfo {
  /** Column titles (one per source), cleaned. */
  names: string[];
  /** Grid width. */
  numCols: number;
  /** Full-resolution image URLs, row-major (comparisons × sources). */
  imageUrls: string[][];
}

/** Extract the `/c/<key>` comparison key from a slow.pics URL. */
export function parseSlowPicsKey(url: string): string | null {
  const m = /(?:^|\/\/)(?:www\.)?slow\.pics\/c\/([A-Za-z0-9]+)/.exec(url);
  return m ? m[1] : null;
}

/** Pull the inline `collection = { … }` object out of a fetched slow.pics page
 *  by balanced-brace scanning (string-aware), then JSON.parse it. */
export function extractCollection(html: string): SlowPicsCollection | null {
  const at = html.search(/\bcollection\s*=\s*\{/);
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.slice(start, i + 1)) as SlowPicsCollection;
          return Array.isArray(parsed?.comparisons) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** A slow.pics source label is often abbreviated/dotted ("(B) Source.Name").
 *  Mirror the on-page slow.pics reader's cleanup. */
function cleanSourceName(name: string): string {
  return name.replace(/^\([BIP]\)\s*/, "").replaceAll(".", " ").trim();
}

const SLOWPICS_CDN = "https://i.slow.pics/";

/** Derive grid column titles + size from a parsed collection. */
export function collectionToGridInfo(col: SlowPicsCollection): SlowPicsGridInfo | null {
  const comps = col.comparisons;
  if (!comps || !comps.length || !comps[0].images?.length) return null;
  const names = comps[0].images.map((im) => cleanSourceName(im.name));
  const numCols = names.length;
  if (numCols < 1) return null;
  const imageUrls = comps.map((c) => c.images.map((im) => SLOWPICS_CDN + im.publicFileName));
  return { names, numCols, imageUrls };
}

// ── Network fetch (userscript host only) ──

const cache = new Map<string, Promise<SlowPicsGridInfo | null>>();

function gmGet(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof GM_xmlhttpRequest !== "function") { resolve(null); return; }
    GM_xmlhttpRequest({
      method: "GET",
      url,
      timeout: 12000,
      onload: (r) => resolve(r.status >= 200 && r.status < 300 ? r.responseText : null),
      onerror: () => resolve(null),
      ontimeout: () => resolve(null),
    });
  });
}

/** Fetch + parse a slow.pics collection by comparison key. Cached per key. */
export function fetchSlowPicsGridInfo(key: string): Promise<SlowPicsGridInfo | null> {
  const cached = cache.get(key);
  if (cached) return cached;
  const p = gmGet(`https://slow.pics/c/${key}`).then((html) => {
    if (!html) return null;
    const col = extractCollection(html);
    return col ? collectionToGridInfo(col) : null;
  });
  cache.set(key, p);
  return p;
}
