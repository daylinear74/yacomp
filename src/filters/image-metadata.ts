// Metadata only: these primaries describe the file, not the browser's decoded
// working space. SVG analysis remains a display-referred preview.
export type ImagePrimaries = "709" | "2020" | "other" | "unknown";
export interface ColorMetadata {
  primaries: ImagePrimaries;
  source: "icc" | "cicp" | "srgb" | "chrm" | "url" | "none" | "unavailable";
}

export interface MetadataHeader {
  complete: boolean;
  requiredBytes: number;
  metadata?: ColorMetadata;
  icc?: Uint8Array;
  compressedICC?: Uint8Array;
}

const text = (b: Uint8Array, at: number, length: number) =>
  new TextDecoder("latin1").decode(b.subarray(at, at + length));
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const need = (requiredBytes: number): MetadataHeader => ({ complete: false, requiredBytes });
const done = (fields: Partial<MetadataHeader> = {}): MetadataHeader => ({
  complete: true, requiredBytes: 0, ...fields,
});

function validPNGChunkCRC(bytes: Uint8Array, at: number, length: number): boolean {
  let crc = 0xffffffff;
  for (let i = at + 4; i < at + 8 + length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0) === view(bytes).getUint32(at + 8 + length);
}

function matchPrimaries(values: number[], candidates: Record<"709" | "2020", number[][]>): ImagePrimaries {
  for (const id of ["709", "2020"] as const) {
    if (candidates[id].some((candidate) => candidate.every((v, i) => Math.abs(v - values[i]) < 0.002))) return id;
  }
  return "other";
}

// ICC matrix columns use D50 PCS values; some older profiles contain D65
// columns. Match numerical colorants first, never copyright text or filenames.
const ICC_COLORANTS = {
  "709": [
    [0.43607, 0.22249, 0.01392, 0.38515, 0.71687, 0.09708, 0.14307, 0.06061, 0.71410],
    [0.41239, 0.21264, 0.01933, 0.35758, 0.71517, 0.11919, 0.18048, 0.07219, 0.95053],
  ],
  "2020": [
    [0.67348, 0.27904, -0.00194, 0.16566, 0.67534, 0.02998, 0.12505, 0.04561, 0.79684],
    [0.63696, 0.26270, 0, 0.14462, 0.67800, 0.02807, 0.16888, 0.05930, 1.06099],
  ],
};
const CHROMATICITIES = {
  "709": [[0.64, 0.33, 0.30, 0.60, 0.15, 0.06]],
  "2020": [[0.708, 0.292, 0.170, 0.797, 0.131, 0.046]],
};

export function iccIs2020(bytes: Uint8Array): boolean {
  // Descriptions must name colorimetry, rather than merely contain a year.
  return /(?:bt|rec|itu-?r(?:\s+bt)?)[\s._-]*2020/i.test(text(bytes, 0, bytes.length));
}

export function readICCPrimaries(bytes: Uint8Array): ImagePrimaries {
  if (bytes.length < 132 || text(bytes, 36, 4) !== "acsp") return "unknown";
  const data = view(bytes);
  const size = data.getUint32(0);
  const count = data.getUint32(128);
  if (size > bytes.length || size < 132 || count > (size - 132) / 12) return "unknown";
  if (text(bytes, 16, 4) !== "RGB ") return "other";
  const tags = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const at = 132 + i * 12;
    const offset = data.getUint32(at + 4), length = data.getUint32(at + 8);
    if (offset < 132 + count * 12 || length < 8 || offset + length > size) return "unknown";
    tags.set(text(bytes, at, 4), bytes.subarray(offset, offset + length));
  }
  const colorants = ["rXYZ", "gXYZ", "bXYZ"].map((key) => tags.get(key));
  if (colorants.every((tag) => tag && tag.length >= 20 && text(tag, 0, 4) === "XYZ ")) {
    return matchPrimaries(colorants.flatMap((tag) => [8, 12, 16].map((at) => view(tag!).getInt32(at) / 65536)), ICC_COLORANTS);
  }
  // LUT-based profiles may have no matrix columns. Read their structured
  // description, including ICC v4's UTF-16BE multi-localized Unicode type.
  const desc = tags.get("desc");
  if (!desc) return "unknown";
  const descriptions: string[] = [];
  if (text(desc, 0, 4) === "mluc" && desc.length >= 16) {
    const v = view(desc), records = v.getUint32(8), stride = v.getUint32(12);
    if (stride < 12 || records > (desc.length - 16) / stride) return "unknown";
    for (let i = 0; i < records; i++) {
      const at = 16 + i * stride, length = v.getUint32(at + 4), offset = v.getUint32(at + 8);
      if (length % 2 || offset < 16 + records * stride || offset + length > desc.length) return "unknown";
      descriptions.push(new TextDecoder("utf-16be").decode(desc.subarray(offset, offset + length)));
    }
  } else if (text(desc, 0, 4) === "desc" && desc.length >= 12) {
    const length = view(desc).getUint32(8);
    if (12 + length > desc.length) return "unknown";
    descriptions.push(text(desc, 12, length));
  }
  for (const description of descriptions) {
    if (iccIs2020(new TextEncoder().encode(description))) return "2020";
    if (/sRGB|(?:bt|rec|itu-?r(?:\s+bt)?)[\s._-]*709/i.test(description)) return "709";
  }
  return "unknown";
}

function scanPNG(bytes: Uint8Array): MetadataHeader {
  const result: Partial<MetadataHeader> = {};
  for (let at = 8; ; ) {
    if (at + 8 > bytes.length) return need(at + 8);
    const length = view(bytes).getUint32(at), type = text(bytes, at + 4, 4);
    // No image payload is needed for classification.
    if (type === "IDAT" || type === "IEND") return done(result);
    const end = at + length + 12;
    if (end > bytes.length) return need(end);
    const chunk = bytes.subarray(at + 8, at + 8 + length);
    if (["cICP", "iCCP", "sRGB", "cHRM"].includes(type) && !validPNGChunkCRC(bytes, at, length)) {
      throw new Error("Corrupted PNG color metadata");
    }
    if (type === "cICP" && length === 4 && chunk[2] === 0 && chunk[3] <= 1) {
      // PNG color-chunk priority: cICP > iCCP > sRGB > cHRM/gAMA.
      return done({ metadata: { primaries: chunk[0] === 1 ? "709" : chunk[0] === 9 ? "2020" : chunk[0] === 2 ? "unknown" : "other", source: "cicp" } });
    }
    if (type === "iCCP") {
      const zero = chunk.indexOf(0);
      if (zero < 1 || zero > 79 || chunk[zero + 1] !== 0 || zero + 2 >= length) throw new Error("Invalid PNG ICC chunk");
      result.compressedICC = chunk.subarray(zero + 2);
    } else if (type === "sRGB" && length === 1 && chunk[0] <= 3) {
      result.metadata = { primaries: "709", source: "srgb" };
    } else if (type === "cHRM" && length === 32 && !result.metadata) {
      result.metadata = { primaries: matchPrimaries([8, 12, 16, 20, 24, 28].map((offset) => view(chunk).getUint32(offset) / 100000), CHROMATICITIES), source: "chrm" };
    }
    at = end;
  }
}

function scanJPEG(bytes: Uint8Array): MetadataHeader {
  const parts = new Map<number, Uint8Array>();
  let total = 0;
  for (let at = 2; ; ) {
    if (at + 2 > bytes.length) return need(at + 2);
    if (bytes[at] !== 0xff) throw new Error("Invalid JPEG marker");
    if (bytes[at + 1] === 0xff) { at++; continue; }
    const marker = bytes[at + 1];
    if (marker === 0xda || marker === 0xd9) {
      if (!total) return done();
      if (parts.size !== total) throw new Error("Incomplete JPEG ICC profile");
      const size = [...parts.values()].reduce((n, p) => n + p.length, 0);
      const icc = new Uint8Array(size);
      let offset = 0;
      for (let i = 1; i <= total; i++) { const p = parts.get(i)!; icc.set(p, offset); offset += p.length; }
      return done({ icc });
    }
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    if (at + 4 > bytes.length) return need(at + 4);
    const length = view(bytes).getUint16(at + 2), end = at + 2 + length;
    if (length < 2) throw new Error("Invalid JPEG segment");
    if (end > bytes.length) return need(end);
    if (marker === 0xe2 && length >= 16 && text(bytes, at + 4, 12) === "ICC_PROFILE\0") {
      const sequence = bytes[at + 16], count = bytes[at + 17];
      if (!count || !sequence || sequence > count || (total && total !== count) || parts.has(sequence)) throw new Error("Invalid JPEG ICC sequence");
      total = count;
      parts.set(sequence, bytes.subarray(at + 18, end));
    }
    at = end;
  }
}

function scanWebP(bytes: Uint8Array): MetadataHeader {
  for (let at = 12; ; ) {
    if (at + 8 > bytes.length) return need(at + 8);
    const type = text(bytes, at, 4), length = view(bytes).getUint32(at + 4, true);
    if (type === "VP8 " || type === "VP8L" || type === "ANIM" || type === "ANMF") return done();
    const end = at + 8 + length;
    if (end > bytes.length) return need(end);
    if (type === "ICCP") return done({ icc: bytes.subarray(at + 8, end) });
    at = end + length % 2;
  }
}

export function scanMetadataHeader(bytes: Uint8Array): MetadataHeader {
  if (bytes.length < 12) return need(12);
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return scanPNG(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return scanJPEG(bytes);
  if (text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WEBP") return scanWebP(bytes);
  return done();
}

export async function metadataFromHeader(header: MetadataHeader, maxICCBytes: number, signal: AbortSignal): Promise<ColorMetadata> {
  if (header.metadata?.source === "cicp") return header.metadata;
  let icc = header.icc;
  if (header.compressedICC) {
    if (typeof DecompressionStream === "undefined") throw new Error("ICC decompression unavailable");
    const stream = new Blob([header.compressedICC as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
    const reader = stream.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        size += value.length;
        if (size > maxICCBytes) throw new Error("ICC profile exceeds byte budget");
        chunks.push(value);
      }
      icc = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { icc.set(chunk, offset); offset += chunk.length; }
    } finally {
      signal.removeEventListener("abort", cancel);
      cancel();
    }
  }
  if (icc) {
    if (icc.length > maxICCBytes) throw new Error("ICC profile exceeds byte budget");
    const primaries = readICCPrimaries(icc);
    if (primaries === "unknown") throw new Error("Unrecognized or incomplete ICC profile");
    return { primaries, source: "icc" };
  }
  return header.metadata ?? { primaries: "unknown", source: "none" };
}
