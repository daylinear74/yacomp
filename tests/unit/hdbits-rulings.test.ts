// Regression coverage for the owner-confirmed HDBits column-title rulings.
// Each block maps to a corpus case (and usually an iconic e2e fixture); these
// lock the PURE-function behaviour so future refactors can't silently break a
// ruling. See tests/fixtures/hdbits/curation/RULINGS.md.

import { describe, test, expect } from "bun:test";
import {
  splitNames, looksLikeNames, stripAsymmetricTitle,
  isFooterLabel, hasExplicitComparison, isMultiSourceLabel,
} from "../../src/grid/names";
import { looksLikeProse } from "../../src/grid/parser";

describe("ruling: vs / vs. / v. / | separators take precedence (1202, 0478, 0288)", () => {
  test("vs", () => expect(splitNames("Source vs Encode")).toEqual(["Source", "Encode"]));
  test("vs.", () => expect(splitNames("JP (Pony Canyon) AVC vs. UK (Anime Ltd) AVC"))
    .toEqual(["JP (Pony Canyon) AVC", "UK (Anime Ltd) AVC"]));
  test("v. with footnote markers (0288)", () =>
    expect(splitNames("720p WEB-DL* v. 1080p WEB-DL v. Capture"))
      .toEqual(["720p WEB-DL*", "1080p WEB-DL", "Capture"]));
  test("pipe", () => expect(splitNames("GER (16,885 kbps) | USA (26,900 kbps)"))
    .toEqual(["GER (16,885 kbps)", "USA (26,900 kbps)"]));
  test("a bare 'v.' inside a name is NOT a separator", () =>
    expect(splitNames("release v.2 - AC3")).toEqual(["release v.2", "AC3"]));
});

describe("ruling: a 'vs' with a missing space is still a separator (1313 + general)", () => {
  test("no space after (…Sharp)vsPhantom)", () =>
    expect(splitNames("Foo) vsPhantom Thread")).toEqual(["Foo)", "Phantom Thread"]));
  test("no space before (Avs B)", () => expect(splitNames("GBRvs USA")).toEqual(["GBR", "USA"]));
  test("no space either side (AvsB / GERvsUSA)", () =>
    expect(splitNames("GERvsUSA")).toEqual(["GER", "USA"]));
  test("uppercase VS inside a name is left alone (AVS = AviSynth)", () =>
    expect(splitNames("AVS Encode")).toEqual(["AVS Encode"]));
  test("'vs' inside an ordinary word is left alone", () => {
    expect(splitNames("Elvis Presley")).toEqual(["Elvis Presley"]);
    expect(splitNames("Service Pack")).toEqual(["Service Pack"]);
  });
});

describe("ruling: strip Video:/Audio:/Subtitle: field prefix (2221, 2425)", () => {
  test("Video:", () => expect(splitNames("Video: GER (1080p AVC) | USA (1080p AVC)"))
    .toEqual(["GER (1080p AVC)", "USA (1080p AVC)"]));
  test("Audio:", () => expect(splitNames("Audio: GER (DTS-HD MA) | USA (DTS-HD MA)"))
    .toEqual(["GER (DTS-HD MA)", "USA (DTS-HD MA)"]));
});

describe("ruling: top-level split masks separators inside parens (wedding 087)", () => {
  test("a '|' inside (...) does not split", () =>
    expect(splitNames("Source (Carlotta | FRA), Geek, TayTO (TWN)"))
      .toEqual(["Source (Carlotta | FRA)", "Geek", "TayTO (TWN)"]));
});

describe("ruling: asymmetric movie-title strip, down to the parallel token (2902)", () => {
  test("strip when asymmetric (Title YEAR … REGION vs REGION)", () =>
    expect(splitNames("Betty 1992 1080p Remux GBR vs USA")).toEqual(["GBR", "USA"]));
  test("keep symmetric full release names (1313)", () =>
    expect(stripAsymmetricTitle([
      "Phantom Thread 2017 1080p Blu-ray", "Phantom Thread 2017 2160p UHD Blu-ray",
    ])).toEqual(["Phantom Thread 2017 1080p Blu-ray", "Phantom Thread 2017 2160p UHD Blu-ray"]));
  test("keep long names whose trailing token is clutter, not a code (1944/1640)", () =>
    expect(stripAsymmetricTitle([
      "Beetlejuice 1988 2160p UHD BluRay Atmos 7.1 (latest madVR test build (113)",
      "Beetlejuice 1988 1080p Blu-ray (with NGU Sharp)", "1080p BD",
    ])).toEqual([
      "Beetlejuice 1988 2160p UHD BluRay Atmos 7.1 (latest madVR test build (113)",
      "Beetlejuice 1988 1080p Blu-ray (with NGU Sharp)", "1080p BD",
    ]));
  test("a parenthesised (YEAR) region is NOT a title prefix (GER (2009))", () =>
    expect(stripAsymmetricTitle(["GER (2009)", "USA"])).toEqual(["GER (2009)", "USA"]));
  test("no title at all → untouched", () =>
    expect(stripAsymmetricTitle(["USA", "GBR"])).toEqual(["USA", "GBR"]));
});

describe("ruling: mediainfo / metric guards (looksLikeNames)", () => {
  test("a mix of a bare metric and a real source is NOT a comparison", () =>
    expect(looksLikeNames(["69.36 kbps", "Subtitle: English"])).toBe(false));
  test("an all-metric bitrate comparison is allowed", () =>
    expect(looksLikeNames(["27191 kbps", "20978 kbps"])).toBe(true));
  test("years/runtimes rejected", () => {
    expect(looksLikeNames(["2010", "2014"])).toBe(false);
    expect(looksLikeNames(["97 min", "100 min"])).toBe(false);
  });
  test("region/format names allowed", () =>
    expect(looksLikeNames(["GBR", "USA", "GER", "AUS"])).toBe(true));
});

describe("ruling: a paragraph mentioning a comparison is prose, not a title (2007, 3040)", () => {
  test("a sentence boundary marks prose (2007: 'UK vs. DE: …on DE. For reference…')", () =>
    expect(looksLikeProse(["UK", "DE: There are lots of parts on DE. For reference, a straight TV"]))
      .toBe(true));
  test("a comma + lowercase connector marks prose (3040: '…, the latter is better, but I forgot…')", () =>
    expect(looksLikeProse(["I checked AMZN 1080p", "AMZN 2160p, the latter is better, but I forgot"]))
      .toBe(true));
  test("a long but tokenised release name is NOT prose (1944)", () =>
    expect(looksLikeProse([
      "Beetlejuice 1988 2160p UHD BluRay HEVC TrueHD Atmos 7.1 (71.2mb/s) dynamic (latest madVR build)",
    ])).toBe(false));
  test("a comma before a CAPITAL or a digit is fine (region list / bitrate)", () => {
    expect(looksLikeProse(["E01 (DE, ES, FR)"])).toBe(false);
    expect(looksLikeProse(["GER (16,885 kbps)"])).toBe(false);
  });
});

describe("ruling: footer / external-comparison labels (007, 2503)", () => {
  test("'Slow.pics' (with a dot) is a footer label", () =>
    expect(isFooterLabel("Slow.pics")).toBe(true));
  test("'Slowpics' and 'slow pics' too", () => {
    expect(isFooterLabel("Slowpics")).toBe(true);
    expect(isFooterLabel("slow pics")).toBe(true);
  });
  test("a real source name is not a footer label", () =>
    expect(isFooterLabel("GBR Blu-ray")).toBe(false));
});

describe("ruling: explicit vs/| vs. comma/dash (separator class)", () => {
  test("vs / | / × / slash are explicit", () => {
    expect(hasExplicitComparison("A vs B")).toBe(true);
    expect(hasExplicitComparison("A | B")).toBe(true);
  });
  test("comma / dash are NOT explicit (single source name)", () => {
    expect(hasExplicitComparison("release - AC3 5.1 - 1.06 GiB")).toBe(false);
    expect(hasExplicitComparison("Disc Title: X, The")).toBe(false);
  });
  test("a section heading IS a multi-source label", () =>
    expect(isMultiSourceLabel("Source (Carlotta | FRA), Geek, TayTO (TWN)")).toBe(true));
  test("a single dashed release is NOT multi-source", () =>
    expect(isMultiSourceLabel("WEBRip NTb x264 - AC3 5.1 - 1.06 GiB")).toBe(false));
});
