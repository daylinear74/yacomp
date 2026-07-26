// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  BT.709 / BT.2020 auto-detection                                         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const csCache = new Map<string, string | Promise<string>>();

function urlHint(src: string): string | null {
  if (/rec\.?2020|bt\.?2020|hdr10|hlg|dolby.?vision|dovi/i.test(src))
    return "2020";
  return null;
}

interface ICCPResult {
  name: Uint8Array;
  data: Uint8Array;
}

function extractICC(bytes: Uint8Array): Uint8Array | ICCPResult | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 4 < bytes.length) {
      if (bytes[i] !== 0xff) break;
      const seg = (bytes[i + 2] << 8) | bytes[i + 3];
      if (
        bytes[i + 1] === 0xe2 &&
        seg > 16 &&
        bytes[i + 4] === 73 &&
        bytes[i + 5] === 67 &&
        bytes[i + 6] === 67 &&
        bytes[i + 7] === 95
      )
        return bytes.slice(i + 18, i + 2 + seg);
      i += 2 + seg;
    }
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    let i = 8;
    while (i + 12 < bytes.length) {
      const len =
        ((bytes[i] << 24) |
          (bytes[i + 1] << 16) |
          (bytes[i + 2] << 8) |
          bytes[i + 3]) >>>
        0;
      const type = String.fromCharCode(
        bytes[i + 4],
        bytes[i + 5],
        bytes[i + 6],
        bytes[i + 7],
      );
      if (type === "iCCP") {
        let j = i + 8;
        while (j < bytes.length && bytes[j] !== 0) j++;
        // Profile name (i+8..j) is uncompressed; data after j+2 is zlib.
        // Return both so iccIs2020 can match the profile name directly.
        return { name: bytes.slice(i + 8, j), data: bytes.slice(j + 2, i + 8 + len) };
      }
      if (type === "IDAT") break;
      i += 12 + len;
    }
  }
  return null;
}

// "2020" must appear in a colorimetry context (BT.2020 / Rec. 2020 / ITU-R
// BT.2020): profile copyright/description strings routinely carry bare years
// ("Copyright (c) 2020 …"), which must not flip an sRGB shot to Rec.2020.
const ICC_2020_RE = /(?:bt|rec|itu-?r(?:\s+bt)?)[\s._-]*2020/i;

export function iccIs2020(buf: Uint8Array): boolean {
  return ICC_2020_RE.test(new TextDecoder("latin1").decode(buf));
}

async function decompressICC(compressed: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const ds = new DecompressionStream("deflate");
    const decompressed = await new Response(
      new Blob([compressed as BlobPart]).stream().pipeThrough(ds),
    ).arrayBuffer();
    return new Uint8Array(decompressed);
  } catch (_) {
    return null;
  }
}

function isICCPResult(icc: Uint8Array | ICCPResult): icc is ICCPResult {
  return !(icc instanceof Uint8Array);
}

export async function detectCS(src: string): Promise<string> {
  if (csCache.has(src)) return csCache.get(src)!;
  const hint = urlHint(src);
  if (hint) {
    csCache.set(src, hint);
    return hint;
  }
  const promise = (async () => {
    let cs = "709";
    try {
      const res = await fetch(src, { headers: { Range: "bytes=0-8191" } });
      if (res.ok) {
        const icc = extractICC(new Uint8Array(await res.arrayBuffer()));
        if (icc) {
          // JPEG: icc is a Uint8Array (uncompressed)
          // PNG:  icc is { name, data } — name is plain text, data is zlib
          if (!isICCPResult(icc)) {
            if (iccIs2020(icc)) cs = "2020";
          } else {
            if (iccIs2020(icc.name)) {
              cs = "2020";
            } else {
              const dec = await decompressICC(icc.data);
              if (dec && iccIs2020(dec)) cs = "2020";
            }
          }
        }
      }
    } catch (_) {
      // A transient failure (offline, CORS blip) must not pin this URL to 709
      // for the rest of the session — drop the entry so a later sync retries.
      csCache.delete(src);
    }
    return cs;
  })();
  csCache.set(src, promise);
  return promise;
}
