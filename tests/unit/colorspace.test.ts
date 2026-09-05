import { describe, test, expect, mock } from "bun:test";
import { createColorMetadataDetector, iccIs2020 } from "../../src/filters/colorspace";
import { readICCPrimaries, scanMetadataHeader, metadataFromHeader } from "../../src/filters/image-metadata";
import { iccChunk, iccProfile, jpegICC, pngChunk, pngHeader } from "../fixtures/color-metadata";

const bytes = (s: string) => new TextEncoder().encode(s);
const response = (data: Uint8Array, status = 200) => new Response(new Uint8Array(data), { status });
const parse = (data: Uint8Array) => metadataFromHeader(scanMetadataHeader(data), 1024 * 1024, new AbortController().signal);
const good2020 = pngHeader(iccChunk(iccProfile("2020")));

describe("ICC descriptions", () => {
  test("recognizes colorimetry text rather than bare years", () => {
    for (const label of ["Rec. ITU-R BT.2020-2", "BT.2020 NCL profile", "rec2020", "ITU-R 2020 primaries", "bt_2020"]) expect(iccIs2020(bytes(label))).toBe(true);
    for (const label of ["Copyright (c) 2020 Adobe Systems", "sRGB IEC61966-2.1 (2020 revision)", "desc\0made in 2020", "unrelated"]) expect(iccIs2020(bytes(label))).toBe(false);
  });
  test("recognizes numerical 2020 and 709 colorants with arbitrary descriptions", () => {
    expect(readICCPrimaries(iccProfile("2020", { description: "Generic profile" }))).toBe("2020");
    expect(readICCPrimaries(iccProfile("709", { description: "Misleading BT.2020 text" }))).toBe("709");
    expect(readICCPrimaries(iccProfile("other", { description: "BT.2020" }))).toBe("other");
  });
  test("reads UTF-16BE mluc and v2 descriptions when matrix tags are absent", () => {
    expect(readICCPrimaries(iccProfile("2020", { matrix: false }))).toBe("2020");
    expect(readICCPrimaries(iccProfile("709", { matrix: false, unicode: false }))).toBe("709");
    expect(readICCPrimaries(iccProfile("2020", { matrix: false, description: "Copyright 2020" }))).toBe("unknown");
  });
  test("rejects truncated profiles and invalid tag offsets", () => {
    const profile = iccProfile("2020");
    expect(readICCPrimaries(profile.subarray(0, profile.length - 1))).toBe("unknown");
    profile.writeUInt32BE(0xffffffff, 136);
    expect(readICCPrimaries(profile)).toBe("unknown");
  });
});

describe("image metadata", () => {
  test("recognizes a compressed ICC profile under a generic PNG profile name", async () => {
    expect(await parse(good2020)).toEqual({ primaries: "2020", source: "icc" });
  });
  test("respects cICP > ICC > sRGB > chromaticity priority regardless of chunk order", async () => {
    const srgb = pngChunk("sRGB", new Uint8Array([0]));
    const cicp709 = pngChunk("cICP", new Uint8Array([1, 13, 0, 1]));
    const icc2020 = iccChunk(iccProfile("2020"));
    expect(await parse(pngHeader(icc2020, srgb, cicp709))).toEqual({ primaries: "709", source: "cicp" });
    expect(await parse(pngHeader(cicp709, icc2020))).toEqual({ primaries: "709", source: "cicp" });
    expect(await parse(pngHeader(icc2020, srgb))).toEqual({ primaries: "2020", source: "icc" });
  });
  test("recognizes BT.2020 cICP and retains unsupported/unspecified primaries", async () => {
    expect(await parse(pngHeader(pngChunk("cICP", bytes(String.fromCharCode(9, 16, 0, 1)))))).toEqual({ primaries: "2020", source: "cicp" });
    expect(await parse(pngHeader(pngChunk("cICP", new Uint8Array([12, 13, 0, 1]))))).toEqual({ primaries: "other", source: "cicp" });
    expect(await parse(pngHeader(pngChunk("cICP", new Uint8Array([2, 2, 0, 1]))))).toEqual({ primaries: "unknown", source: "cicp" });
  });
  test("recognizes cHRM primary coordinates", async () => {
    const data = Buffer.alloc(32);
    [.3127, .329, .708, .292, .170, .797, .131, .046].forEach((v, i) => data.writeUInt32BE(Math.round(v * 100000), i * 4));
    expect(await parse(pngHeader(pngChunk("cHRM", data)))).toEqual({ primaries: "2020", source: "chrm" });
  });
  test("reassembles JPEG ICC parts by sequence and rejects missing/duplicate parts", async () => {
    expect(await parse(jpegICC(iccProfile("2020"), [2, 1]))).toEqual({ primaries: "2020", source: "icc" });
    expect(() => scanMetadataHeader(jpegICC(iccProfile("2020"), [1]))).toThrow();
    expect(() => scanMetadataHeader(jpegICC(iccProfile("2020"), [1, 1]))).toThrow();
  });
  test("reads WebP ICC before its pixel payload", async () => {
    const profile = iccProfile("2020"), chunk = Buffer.alloc(8);
    chunk.write("ICCP"); chunk.writeUInt32LE(profile.length, 4);
    const header = Buffer.from("RIFF\0\0\0\0WEBP");
    expect(await parse(Buffer.concat([header, chunk, profile]))).toEqual({ primaries: "2020", source: "icc" });
  });
  test("reports incomplete headers instead of confirming 709", () => {
    expect(scanMetadataHeader(good2020.subarray(0, 40)).complete).toBe(false);
  });
  test("does not trust corrupted color chunks", () => {
    const corrupted = pngHeader(pngChunk("cICP", new Uint8Array([9, 16, 0, 1])));
    corrupted[41] = 1; // Change primaries without updating the chunk CRC.
    expect(() => scanMetadataHeader(corrupted)).toThrow("Corrupted PNG color metadata");
  });
});

describe("bounded metadata detection", () => {
  test("authoritative sRGB overrides an HDR filename; hints are only used after an untagged header", async () => {
    const fetchImage = mock(async () => response(pngHeader(iccChunk(iccProfile("709")))));
    const detector = createColorMetadataDetector({ fetch: fetchImage });
    expect(await detector.detect("https://example.invalid/hdr10.png")).toEqual({ primaries: "709", source: "icc" });
    expect(fetchImage).toHaveBeenCalledTimes(1);
    const untagged = createColorMetadataDetector({ fetch: async () => response(pngHeader()) });
    expect(await untagged.detect("https://example.invalid/bt2020.png")).toEqual({ primaries: "2020", source: "url" });
  });
  test("extends a partial header past 8 KiB within the budget", async () => {
    const file = pngHeader(pngChunk("tEXt", bytes("Note\0" + "x".repeat(12000))), iccChunk(iccProfile("2020")));
    const ranges: string[] = [];
    const detector = createColorMetadataDetector({ fetch: async (_url, init) => {
      const range = new Headers(init.headers).get("Range")!;
      ranges.push(range);
      const end = Number(range.split("-")[1]);
      return response(file.subarray(0, end + 1), 206);
    } });
    expect(await detector.detect("late.png")).toEqual({ primaries: "2020", source: "icc" });
    expect(ranges).toEqual(["bytes=0-8191", "bytes=0-16383"]);
  });
  test("cancels a Range-ignoring response as soon as metadata is complete", async () => {
    let delivered = 0, cancelled = false;
    const detector = createColorMetadataDetector({ fetch: async () => new Response(new ReadableStream({
      pull(controller) {
        const chunk = new Uint8Array(1024);
        if (!delivered) chunk.set(good2020);
        delivered += chunk.length; controller.enqueue(chunk);
      },
      cancel() { cancelled = true; },
    })) });
    expect(await detector.detect("large.png")).toEqual({ primaries: "2020", source: "icc" });
    expect(cancelled).toBe(true);
    expect(delivered).toBeLessThanOrEqual(4096);
  });
  test("bounds oversized headers and compressed ICC output", async () => {
    const largeHeader = pngHeader(pngChunk("tEXt", new Uint8Array(128000)), iccChunk(iccProfile("2020")));
    const headerDetector = createColorMetadataDetector({ fetch: async () => response(largeHeader), maxHeaderBytes: 16384 });
    expect(await headerDetector.detect("header.png")).toEqual({ primaries: "unknown", source: "unavailable" });
    const compressed = pngHeader(iccChunk(new Uint8Array(100000)));
    const profileDetector = createColorMetadataDetector({ fetch: async () => response(compressed), maxICCBytes: 1024 });
    expect(await profileDetector.detect("compressed.png")).toEqual({ primaries: "unknown", source: "unavailable" });
  });
  test("retries HTTP failures after a short backoff and then caches successful metadata", async () => {
    let now = 0;
    const fetchImage = mock(async () => fetchImage.mock.calls.length === 1 ? new Response("unavailable", { status: 503 }) : response(good2020));
    const detector = createColorMetadataDetector({ fetch: fetchImage, now: () => now, retryMs: 1000 });
    expect((await detector.detect("retry.png")).source).toBe("unavailable");
    expect((await detector.detect("retry.png")).source).toBe("unavailable");
    expect(fetchImage).toHaveBeenCalledTimes(1);
    now = 1001;
    expect((await detector.detect("retry.png")).primaries).toBe("2020");
    await detector.detect("retry.png");
    expect(fetchImage).toHaveBeenCalledTimes(2);
  });
  test("backs off thrown CORS errors too", async () => {
    const fetchImage = mock(async () => { throw new TypeError("Failed to fetch"); });
    const detector = createColorMetadataDetector({ fetch: fetchImage });
    await detector.detect("cors.png"); await detector.detect("cors.png");
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });
  test("times out a stalled fetch", async () => {
    let aborted = false;
    const detector = createColorMetadataDetector({ timeoutMs: 20, fetch: (_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => { aborted = true; reject(init.signal!.reason); }, { once: true });
    }) });
    expect((await detector.detect("stalled.png")).source).toBe("unavailable");
    expect(aborted).toBe(true);
  });
  test("times out a stalled response body", async () => {
    let cancelled = false;
    const detector = createColorMetadataDetector({ timeoutMs: 20, fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) });
    expect((await detector.detect("body.png")).source).toBe("unavailable");
    expect(cancelled).toBe(true);
  });
  test("deduplicates subscribers and only aborts a request when its last consumer leaves", async () => {
    let finish!: () => void, fetchAborted = false;
    const fetchImage = mock((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      finish = () => resolve(response(good2020));
      init.signal!.addEventListener("abort", () => { fetchAborted = true; reject(init.signal!.reason); }, { once: true });
    }));
    const detector = createColorMetadataDetector({ fetch: fetchImage });
    const a = new AbortController(), b = new AbortController();
    const first = detector.detect("shared.png", a.signal).catch(() => "aborted");
    const second = detector.detect("shared.png", b.signal);
    a.abort(); expect(await first).toBe("aborted"); expect(fetchAborted).toBe(false);
    finish(); expect((await second).primaries).toBe("2020"); expect(fetchImage).toHaveBeenCalledTimes(1);
    const c = new AbortController(); const third = detector.detect("cancel.png", c.signal).catch(() => "aborted");
    c.abort(); expect(await third).toBe("aborted"); expect(fetchAborted).toBe(true);
    expect(detector.cached("cancel.png")).toBeUndefined();
  });
  test("bounds the result cache with LRU eviction", async () => {
    const fetchImage = mock(async () => response(good2020));
    const detector = createColorMetadataDetector({ fetch: fetchImage, maxEntries: 2 });
    await detector.detect("a.png"); await detector.detect("b.png"); await detector.detect("a.png"); await detector.detect("c.png");
    expect(detector.cached("a.png")).toBeDefined(); expect(detector.cached("b.png")).toBeUndefined();
    expect(fetchImage).toHaveBeenCalledTimes(3);
  });
  test("limits concurrent requests and removes cancelled queued work", async () => {
    const releases: (() => void)[] = [];
    const fetchImage = mock(async () => { await new Promise<void>((resolve) => releases.push(resolve)); return response(good2020); });
    const detector = createColorMetadataDetector({ fetch: fetchImage, maxRequests: 2 });
    const first = detector.detect("a.png"), second = detector.detect("b.png");
    const controller = new AbortController();
    const queued = detector.detect("c.png", controller.signal).catch(() => "aborted");
    expect(fetchImage).toHaveBeenCalledTimes(2);
    controller.abort(); expect(await queued).toBe("aborted");
    releases.forEach((r) => r()); await Promise.all([first, second]);
    expect(fetchImage).toHaveBeenCalledTimes(2);
  });
});
