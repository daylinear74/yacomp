import { siteEnabled, type SiteKey } from "../config";

const HOST_SITE_KEYS: ReadonlyArray<readonly [RegExp, SiteKey]> = [
  [/(?:^|\.)slow\.pics$/i, "slowpics"],
  [/(?:^|\.)comp\.pics$/i, "comppics"],
  [/(?:^|\.)passthepopcorn\.me$/i, "ptp"],
  [/(?:^|\.)hdbits\.org$/i, "hdbits"],
  [/(?:^|\.)springsunday\.net$/i, "ssd"],
  [/^pt\.keepfrds\.com$/i, "frds"],
  [/(?:^|\.)blutopia\.cc$/i, "blutopia"],
  [/(?:^|\.)aither\.cc$/i, "aither"],
  [/(?:^|\.)beyond-hd\.me$/i, "bhd"],
  [/(?:^|\.)greatposterwall\.com$/i, "gpw"],
];

export function siteKeyForHostname(hostname: string = location.hostname): SiteKey | null {
  for (const [pattern, key] of HOST_SITE_KEYS) {
    if (pattern.test(hostname)) return key;
  }
  return null;
}

export function siteBehaviorEnabled(hostname: string = location.hostname): boolean {
  const key = siteKeyForHostname(hostname);
  return key === null || siteEnabled(key);
}
