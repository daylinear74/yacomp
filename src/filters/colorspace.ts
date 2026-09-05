import { metadataFromHeader, scanMetadataHeader, type ColorMetadata } from "./image-metadata";
export { iccIs2020 } from "./image-metadata";
export type { ColorMetadata } from "./image-metadata";

const HEADER_BYTES = 8192;
const MAX_HEADER_BYTES = 256 * 1024;
const MAX_ICC_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 2000;
const RETRY_MS = 1000;
const MAX_CACHE_ENTRIES = 256;
const MAX_REQUESTS = 4;

const unavailable = (): ColorMetadata => ({ primaries: "unknown", source: "unavailable" });
function urlFallback(src: string): ColorMetadata {
  return /rec\.?2020|bt\.?2020|hdr10|hlg|dolby.?vision|dovi/i.test(src)
    ? { primaries: "2020", source: "url" }
    : { primaries: "unknown", source: "none" };
}

type FetchImage = (url: string, init: RequestInit) => Promise<Response>;
interface DetectorOptions {
  fetch?: FetchImage;
  now?: () => number;
  timeoutMs?: number;
  retryMs?: number;
  maxEntries?: number;
  maxRequests?: number;
  maxHeaderBytes?: number;
  maxICCBytes?: number;
}

async function readMetadata(
  src: string,
  fetchImage: FetchImage,
  signal: AbortSignal,
  maxHeaderBytes: number,
  maxICCBytes: number,
): Promise<ColorMetadata> {
  // Retry a larger prefix only when a partial response ends inside metadata.
  // Prefixes avoid relying on CORS exposure of Content-Range. Their geometric
  // growth bounds total consumed bytes below twice the header budget.
  for (let requested = Math.min(HEADER_BYTES, maxHeaderBytes); ; ) {
    const res = await fetchImage(src, { headers: { Range: "bytes=0-" + (requested - 1) }, signal });
    if (!res.ok || !res.body) {
      void res.body?.cancel().catch(() => {});
      throw new Error("Image metadata unavailable");
    }
    if (res.status === 206) {
      const range = res.headers.get("Content-Range");
      if (range && !/^bytes 0-\d+\/(?:\d+|\*)$/i.test(range)) {
        void res.body.cancel().catch(() => {});
        throw new Error("Unexpected image byte range");
      }
    }
    const reader = res.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    const limit = res.status === 206 ? requested : maxHeaderBytes;
    const bytes = new Uint8Array(limit);
    let length = 0;
    let header = scanMetadataHeader(bytes.subarray(0, 0));
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        let offset = 0;
        while (offset < value.length && length < limit) {
          // Inspect at small intervals even if a server ignores Range and
          // delivers a large chunk. Never buffer or drain the whole original.
          const take = Math.min(value.length - offset, HEADER_BYTES, limit - length);
          bytes.set(value.subarray(offset, offset + take), length);
          length += take;
          offset += take;
          header = scanMetadataHeader(bytes.subarray(0, length));
          if (header.complete) {
            cancel();
            return await metadataFromHeader(header, maxICCBytes, signal);
          }
          if (header.requiredBytes > maxHeaderBytes) throw new Error("Image header exceeds byte budget");
        }
        if (length === limit) break;
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      cancel();
    }
    if (res.status !== 206 || length < requested || requested === maxHeaderBytes) {
      throw new Error("Incomplete image metadata");
    }
    requested = Math.min(maxHeaderBytes, Math.max(requested * 2, header.requiredBytes));
  }
}

interface PendingLookup {
  controller: AbortController;
  promise: Promise<ColorMetadata>;
  resolve: (value: ColorMetadata) => void;
  users: number;
  cancelled: boolean;
}

/** Successful metadata is cached separately from a short-lived unavailable
 * result. Shared requests survive one subscriber cancelling, but stop when
 * superseded filter work was their last consumer. */
export function createColorMetadataDetector(options: DetectorOptions = {}) {
  const fetchImage: FetchImage = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? MAX_CACHE_ENTRIES;
  const maxRequests = options.maxRequests ?? MAX_REQUESTS;
  const cache = new Map<string, { value: ColorMetadata; until: number }>();
  const pending = new Map<string, PendingLookup>();
  const queue: { src: string; lookup: PendingLookup }[] = [];
  let running = 0;

  function cached(src: string): ColorMetadata | undefined {
    const entry = cache.get(src);
    if (!entry) return;
    cache.delete(src);
    if (entry.until <= now()) return;
    cache.set(src, entry); // bounded LRU
    return entry.value;
  }

  function pump(): void {
    while (running < maxRequests && queue.length) {
      const { src, lookup } = queue.shift()!;
      if (lookup.cancelled) continue;
      running++;
      const timeout = setTimeout(() => lookup.controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
      void readMetadata(src, fetchImage, lookup.controller.signal, options.maxHeaderBytes ?? MAX_HEADER_BYTES, options.maxICCBytes ?? MAX_ICC_BYTES)
        .then((metadata) => metadata.source === "none" ? urlFallback(src) : metadata)
        .catch(() => unavailable())
        .then((value) => {
          if (pending.get(src) === lookup) pending.delete(src);
          if (!lookup.cancelled) {
            cache.set(src, { value, until: value.source === "unavailable" ? now() + (options.retryMs ?? RETRY_MS) : Infinity });
            while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
          }
          lookup.resolve(value);
        })
        .finally(() => {
          clearTimeout(timeout);
          if (pending.get(src) === lookup) pending.delete(src);
          running--;
          pump();
        });
    }
  }

  function detect(src: string, signal?: AbortSignal): Promise<ColorMetadata> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const hit = cached(src);
    if (hit) return Promise.resolve(hit);
    let lookup = pending.get(src);
    if (!lookup) {
      // Bursts from background loading must not create an unbounded queue.
      // A later sync may retry these uncached, unavailable results.
      if (pending.size >= maxEntries) return Promise.resolve(unavailable());
      let resolve!: (value: ColorMetadata) => void;
      lookup = { controller: new AbortController(), promise: new Promise((done) => { resolve = done; }), resolve, users: 0, cancelled: false };
      pending.set(src, lookup);
      queue.push({ src, lookup });
    }
    const shared = lookup;
    shared.users++;
    const result = new Promise<ColorMetadata>((resolve, reject) => {
      let finished = false;
      const finish = (aborted: boolean, value?: ColorMetadata) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", abort);
        shared.users--;
        if (aborted) {
          if (!shared.users && pending.get(src) === shared) {
            shared.cancelled = true;
            pending.delete(src);
            shared.controller.abort();
            shared.resolve(unavailable());
            const at = queue.findIndex((entry) => entry.lookup === shared);
            if (at >= 0) queue.splice(at, 1);
          }
          reject(signal?.reason);
        } else resolve(value!);
      };
      const abort = () => finish(true);
      signal?.addEventListener("abort", abort, { once: true });
      void shared.promise.then((value) => finish(false, value));
    });
    pump();
    return result;
  }

  return { detect, cached };
}

const detector = createColorMetadataDetector();
export const detectColorMetadata = detector.detect;
export const cachedColorMetadata = detector.cached;

/** Compatibility matrix selector. Unknown/unsupported metadata uses the 709
 * display preview; provenance distinguishes that fallback from confirmed 709. */
export async function detectCS(src: string, signal?: AbortSignal): Promise<"709" | "2020"> {
  const metadata = await detectColorMetadata(src, signal);
  return metadata.primaries === "2020" ? "2020" : "709";
}
