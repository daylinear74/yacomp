// Small generated fixtures: no third-party profile files or image payloads.
import { deflateSync } from "node:zlib";

export function pngChunk(type: string, data: Uint8Array): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length);
  header.write(type, 4, "ascii");
  const body = Buffer.from(data);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([header.subarray(4), body])) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, body, trailer]);
}

export function pngHeader(...chunks: Uint8Array[]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", ihdr),
    ...chunks, pngChunk("IDAT", deflateSync(Buffer.from([0, 128, 128, 128]))), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function iccChunk(profile: Uint8Array, name = "ICC Profile"): Buffer {
  return pngChunk("iCCP", Buffer.concat([Buffer.from(name + "\0\0"), deflateSync(profile)]));
}

export function iccProfile(primaries: "709" | "2020" | "other", opts: { description?: string; matrix?: boolean; unicode?: boolean } = {}): Buffer {
  const label = opts.description ?? (primaries === "other" ? "Display P3" : "Rec. ITU-R BT." + primaries);
  const tags: { key: string; data: Buffer }[] = [];
  let desc: Buffer;
  if (opts.unicode !== false) {
    const encoded = Buffer.from(label, "utf16le").swap16();
    desc = Buffer.alloc(28 + encoded.length);
    desc.write("mluc", 0); desc.writeUInt32BE(1, 8); desc.writeUInt32BE(12, 12);
    desc.write("enUS", 16); desc.writeUInt32BE(encoded.length, 20); desc.writeUInt32BE(28, 24); encoded.copy(desc, 28);
  } else {
    const encoded = Buffer.from(label + "\0");
    desc = Buffer.alloc(12 + encoded.length); desc.write("desc", 0); desc.writeUInt32BE(encoded.length, 8); encoded.copy(desc, 12);
  }
  tags.push({ key: "desc", data: desc });
  if (opts.matrix !== false) {
    // D50-adapted colorants used by real ICC matrix profiles.
    const values = primaries === "2020"
      ? [[.673477, .279037, -.001938], [.165665, .675339, .029984], [.125046, .045609, .796844]]
      : primaries === "709"
        ? [[.436066, .222488, .013916], [.385147, .716873, .097076], [.143066, .060608, .714096]]
        : [[.5151, .2412, -.0011], [.2920, .6922, .0419], [.1571, .0666, .7841]];
    values.forEach((xyz, i) => {
      const data = Buffer.alloc(20); data.write("XYZ ", 0);
      xyz.forEach((v, c) => data.writeInt32BE(Math.round(v * 65536), 8 + c * 4));
      tags.push({ key: ["rXYZ", "gXYZ", "bXYZ"][i], data });
    });
  }
  const table = Buffer.alloc(132 + 12 * tags.length);
  table.write("RGB ", 16); table.write("XYZ ", 20); table.write("acsp", 36); table.writeUInt32BE(tags.length, 128);
  let offset = table.length;
  const payload: Buffer[] = [];
  tags.forEach(({key,data}, i) => {
    table.write(key, 132 + i * 12); table.writeUInt32BE(offset, 136 + i * 12); table.writeUInt32BE(data.length, 140 + i * 12);
    payload.push(data); offset += data.length;
    const padding = (4 - data.length % 4) % 4; payload.push(Buffer.alloc(padding)); offset += padding;
  });
  table.writeUInt32BE(offset, 0);
  return Buffer.concat([table, ...payload]);
}

export function jpegICC(profile: Uint8Array, order = [1, 2]): Buffer {
  const middle = Math.floor(profile.length / 2);
  const parts = [profile.subarray(0, middle), profile.subarray(middle)];
  const segments = order.map((sequence) => {
    const data = Buffer.concat([Buffer.from("ICC_PROFILE\0"), Buffer.from([sequence, 2]), parts[sequence - 1]]);
    const marker = Buffer.from([255, 226, 0, 0]); marker.writeUInt16BE(data.length + 2, 2);
    return Buffer.concat([marker, data]);
  });
  return Buffer.concat([Buffer.from([255, 216]), ...segments, Buffer.from([255, 218, 0, 2])]);
}
