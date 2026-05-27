import { beforeEach, describe, expect, test } from "bun:test";
import { getConfig, resetConfig, saveConfig } from "../../src/config";
import { siteBehaviorEnabled, siteKeyForHostname } from "../../src/sites/current-site";

describe("siteKeyForHostname", () => {
  test("maps every supported userscript host to its enabledSites key", () => {
    const supportedHosts = [
      ["slow.pics", "slowpics"],
      ["comp.pics", "comppics"],
      ["passthepopcorn.me", "ptp"],
      ["hdbits.org", "hdbits"],
      ["springsunday.net", "ssd"],
      ["pt.keepfrds.com", "frds"],
      ["blutopia.cc", "blutopia"],
      ["aither.cc", "aither"],
      ["beyond-hd.me", "bhd"],
      ["greatposterwall.com", "gpw"],
    ] as const;

    for (const [hostname, key] of supportedHosts) {
      expect(siteKeyForHostname(hostname)).toBe(key);
    }
  });

  test("does not impose a site preference on non-userscript hosts", () => {
    expect(siteKeyForHostname("127.0.0.1")).toBeNull();
  });
});

describe("siteBehaviorEnabled", () => {
  beforeEach(() => resetConfig());

  test("disables only behavior associated with the disabled current site", () => {
    saveConfig({
      enabledSites: { ...getConfig().enabledSites, slowpics: false },
    });

    expect(siteBehaviorEnabled("slow.pics")).toBe(false);
    expect(siteBehaviorEnabled("comp.pics")).toBe(true);
  });
});
