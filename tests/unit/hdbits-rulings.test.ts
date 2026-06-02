// Regression coverage for the owner-confirmed HDBits column-title rulings.
// Each block maps to a corpus case (and usually an iconic e2e fixture); these
// lock the PURE-function behaviour so future refactors can't silently break a
// ruling. See tests/fixtures/hdbits/curation/RULINGS.md.

import { describe, test, expect } from "bun:test";
import {
  splitNames, looksLikeNames, stripAsymmetricTitle,
  isFooterLabel, hasExplicitComparison, isMultiSourceLabel, asColumnTitles,
  namesFromLeadingText, namesFromColorSpans,
} from "../../src/grid/names";
import { looksLikeProse } from "../../src/grid/parser";

const fakeTextNode = (text: string): ChildNode =>
  ({ nodeType: 3, nodeName: "#text", textContent: text }) as unknown as ChildNode;
const fakeBrNode = (): ChildNode =>
  ({ nodeType: 1, nodeName: "BR", textContent: "" }) as unknown as ChildNode;
const fakeImageLink = (): ChildNode =>
  ({ nodeType: 1, nodeName: "A", textContent: "", querySelector: () => ({}) }) as unknown as ChildNode;
const fakeContainer = (...childNodes: ChildNode[]): Element =>
  ({ childNodes }) as unknown as Element;
const fakeColorContainer = (...labels: string[]): Element =>
  ({ querySelectorAll: () => labels.map((textContent) => ({ textContent })) }) as unknown as Element;

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

describe("ruling: '>>>' / '>>' (better-than) is a comparison separator (79242)", () => {
  test("splits on >>>", () =>
    expect(splitNames("Eureka Classics >>> Cargo Records")).toEqual(["Eureka Classics", "Cargo Records"]));
  test("splits on >> and chains", () =>
    expect(splitNames("GER >> USA >> FRA")).toEqual(["GER", "USA", "FRA"]));
  test("a one-sided decorative arrow run yields one part (no false split)", () => {
    expect(splitNames("BD >>>>>")).toEqual(["BD"]);
    expect(splitNames(">>>>> AMZN")).toEqual(["AMZN"]);
  });
  test("a single '>' is NOT a separator", () =>
    expect(splitNames("Source > Encode")).toEqual(["Source > Encode"]));
});

describe("ruling: '~' is a comparison separator (78043)", () => {
  test("splits on ' ~ '", () => expect(splitNames("AMAZON ~ FRA BD")).toEqual(["AMAZON", "FRA BD"]));
  test("a '~' size approximation is left alone", () =>
    expect(splitNames("Movie ~5GB remux")).toEqual(["Movie ~5GB remux"]));
  // '~' is the LOWEST-precedence separator: when a stronger separator ('/', '|',
  // vs) already splits the line, each "REGION ~ distributor" is ONE source and
  // the '~' must NOT split further (2241: GBR via BFI / USA via Criterion).
  test("a higher-precedence '/' wins; '~' stays a sub-connector (2241)", () =>
    expect(splitNames("GBR ~ BFI (1080p AVC 29978 kbps) / USA ~ CC (1080p AVC 34984 kbps)"))
      .toEqual(["GBR ~ BFI (1080p AVC 29978 kbps)", "USA ~ CC (1080p AVC 34984 kbps)"]));
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

describe("asColumnTitles: the one column-title predicate (MODEL.md)", () => {
  test("keeps a clean vs/| comparison title", () => {
    expect(asColumnTitles("Source vs Encode")).toEqual(["Source", "Encode"]);
    expect(asColumnTitles("GER (16,885 kbps) | USA (26,900 kbps)"))
      .toEqual(["GER (16,885 kbps)", "USA (26,900 kbps)"]);
  });
  test("keeps the 0288 v. footnote ruling (v. is a separator, not a sentence end)", () =>
    expect(asColumnTitles("720p WEB-DL* v. 1080p WEB-DL v. Capture"))
      .toEqual(["720p WEB-DL*", "1080p WEB-DL", "Capture"]));
  test("keeps angle-wrapped dash labels after rejecting the surrounding file-list (0049/0050)", () =>
    expect(asColumnTitles("< SOURCE >-< iFT >-< EbP (non OAR) >"))
      .toEqual(["SOURCE", "iFT", "EbP (non OAR)"]));
  test("keeps punctuation inside source names (2857: Shout! Factory)", () =>
    expect(asColumnTitles("USA (Shout! Factory) vs. GBR (BFI)"))
      .toEqual(["USA (Shout! Factory)", "GBR (BFI)"]));
  test("keeps dotted abbreviations inside source names", () =>
    expect(asColumnTitles("Movies Anywhere 2160p WEB-DL (Resized) vs. Warner Bros. Blu-ray (2019)"))
      .toEqual(["Movies Anywhere 2160p WEB-DL (Resized)", "Warner Bros. Blu-ray (2019)"]));
  test("keeps exclamation-mark studio names", () =>
    expect(asColumnTitles("Shout! Factory (USA) vs Powerhouse Films (GBR)"))
      .toEqual(["Shout! Factory (USA)", "Powerhouse Films (GBR)"]));
  test("keeps dot-leader spacing labels", () =>
    expect(asColumnTitles("POL ..................................................................... vs ....................................................................... US"))
      .toEqual(["POL", "US"]));
  test("keeps multiline release labels where a vs line continues on the next line (0978)", () =>
    expect(asColumnTitles(`The.Path.S02E13.Mercy.1080p.AMZN.WEBRip.DD5.1.x264-NTb (3.20GB, 8444Kbps) vs.
The.Path.S02E13.Mercy.1080p.HULU.WEBRip.AAC2.0.H.264-NTb (1.76GB, 4626Kbps):`))
      .toEqual([
        "The.Path.S02E13.Mercy.1080p.AMZN.WEBRip.DD5.1.x264-NTb (3.20GB, 8444Kbps)",
        "The.Path.S02E13.Mercy.1080p.HULU.WEBRip.AAC2.0.H.264-NTb (1.76GB, 4626Kbps)",
      ]));
  test("keeps multiline release labels with a bare vs. line (1033/1443)", () =>
    expect(asColumnTitles(`Salvation.S01E01.Pilot.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb (2.85GB, 8 439 kb/s)
vs.
Salvation.S01E01.1080p.HDTV.X264-DIMENSION (4.78GB, 14.2 Mb/s)`))
      .toEqual([
        "Salvation.S01E01.Pilot.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb (2.85GB, 8 439 kb/s)",
        "Salvation.S01E01.1080p.HDTV.X264-DIMENSION (4.78GB, 14.2 Mb/s)",
      ]));
  test("keeps multiline chained vs labels across three lines (1460)", () =>
    expect(asColumnTitles(`DE (Kaze) AVC @ 31Mb/s vs. IT (Dynit) AVC @ 36Mb/s vs.
JP (CoMix Wave) AVC @ 34Mb/s vs. UK (Anime Ltd) AVC @ 17Mb/s
vs. US (Sentai Filmworks) AVC @ 20Mb/s`))
      .toEqual([
        "DE (Kaze) AVC @ 31Mb/s",
        "IT (Dynit) AVC @ 36Mb/s",
        "JP (CoMix Wave) AVC @ 34Mb/s",
        "UK (Anime Ltd) AVC @ 17Mb/s",
        "US (Sentai Filmworks) AVC @ 20Mb/s",
      ]));
  test("keeps multiline release labels when continuation lines start with vs. (1553/1560)", () =>
    expect(asColumnTitles(`Prometheus 2012 2160p UHD BluRay HEVC TrueHD Atmos 7.1 (68.7mb/s) dynamic (latest madVR test build (113)
vs. Prometheus 2012 1080p Blu-ray (FRA EUR) AVC DTS-HDMA 7.1-decibeL (with NGU Sharp (High) upscaling)
vs. madVR dynamic HDR tone-mapped screenshot from UHD`))
      .toEqual([
        "Prometheus 2012 2160p UHD BluRay HEVC TrueHD Atmos 7.1 (68.7mb/s) dynamic (latest madVR test build (113)",
        "Prometheus 2012 1080p Blu-ray (FRA EUR) AVC DTS-HDMA 7.1-decibeL (with NGU Sharp (High) upscaling)",
        "madVR dynamic HDR tone-mapped screenshot from UHD",
      ]));
  test("removes leading bare vs markers from continuation labels (0961)", () =>
    expect(asColumnTitles(`Nerve.2016.Open.Matte.1080p.WEBRip.AAC2.0.x264-Blutopia
vs Nerve 2016 Open Matte 1080p WEB-DL DTS 5.1 H.264
vs Nerve.2016.1080p.AMZN.WEB-DL.DDP5.1.H.264-FiBERHD`))
      .toEqual([
        "Nerve.2016.Open.Matte.1080p.WEBRip.AAC2.0.x264-Blutopia",
        "Nerve 2016 Open Matte 1080p WEB-DL DTS 5.1 H.264",
        "Nerve.2016.1080p.AMZN.WEB-DL.DDP5.1.H.264-FiBERHD",
      ]));
  test("keeps stacked source labels with bitrate-vs line (1498)", () =>
    expect(asColumnTitles(`ReMuX @ 2160p
     (25643 kbps)       vs.    GER UHD (68731 kbps)`))
      .toEqual(["ReMuX @ 2160p", "GER UHD (68731 kbps)"]));
  test("keeps visually spaced stacked source labels with bitrate-vs line (2282)", () =>
    expect(asColumnTitles(`1080p BD @ 2160p                         4K HDR WEB-DL
            (23904 kbps)             vs.          (~24640 kbps)`))
      .toEqual(["1080p BD @ 2160p", "4K HDR WEB-DL (~24640 kbps)"]));
  test("splits visual wide-space column headings (0431/0247)", () =>
    expect(asColumnTitles("Source                                Encode                                HDTV"))
      .toEqual(["Source", "Encode", "HDTV"]));
  test("drops comma-prose (0117 — whole-line check, since splitting hides it)", () =>
    expect(asColumnTitles("For some reason, D+ added black bars, but Amazon abandoned them, my comparison is not with the capture.")).toBeNull());
  test("drops comma-prose with capitalized sentence subjects", () =>
    expect(asColumnTitles("Ah right in one of my areas of expertise, Apple are incompetent morons")).toBeNull());
  test("drops dash-prose with capitalized sentence subjects", () =>
    expect(asColumnTitles("Ah right in one of my areas of expertise - Apple are incompetent morons")).toBeNull());
  test("drops comma-prose with lowercase sentence subjects", () =>
    expect(asColumnTitles("Also, some weird stuff in the UHD i.e. look at Schwarzenegger's right collarbone here")).toBeNull());
  test("drops comma-prose with an 'as you can see' aside (0317)", () =>
    expect(asColumnTitles("First shot isn't the same frame type but as you can see, there are more pressing concerns than compression here...")).toBeNull());
  test("drops runtime prose that happens to contain vs (1209)", () =>
    expect(asColumnTitles("Amazon is also a shorter cut than the HDTV... 52 vs 59min/episode")).toBeNull());
  test("drops x264 settings that happen to use slash separators (0061)", () =>
    expect(asColumnTitles("cabac=1 / ref=9 / deblock=1:-2:-2 / analyse=0x3:0x133 / me=esa / subme=11")).toBeNull());
  test("drops MediaInfo field/value rows split by visual wide spacing (0961/2375)", () =>
    expect(asColumnTitles("Forced                                : No")).toBeNull());
  test("drops MediaInfo bitrate rows split by a spaced tilde (0247)", () =>
    expect(asColumnTitles("BITRATE.......: Variable ~ 17 366 Kbps")).toBeNull());
  test("drops cut-only labels when a richer source heading is nearby (082)", () =>
    expect(asColumnTitles("Extended                                Extended                                Theatrical")).toBeNull());
  test("drops tone-mapping setting labels with no source identity (1489)", () =>
    expect(asColumnTitles("at 130 nits with are you nuts?! vs none vs clipped reference at 994 target peak nits")).toBeNull());
  test("drops function-call argument lists that happen to use comma separators (2391)", () =>
    expect(asColumnTitles('LinearTransformation(Input="BT2020_HLG", Output="Linear_BT709")')).toBeNull());
  test("drops vs-prose (2007 — sentence boundary inside a part)", () =>
    expect(asColumnTitles("UK vs. DE: There are lots of parts on DE. For reference, a straight TV")).toBeNull());
  test("drops a leading 'User wrote:' quote attribution (1009)", () =>
    expect(asColumnTitles("bananajoe25 wrote:Handmaid 1080p Blu-ray vs Handmaid 2160p WEB-DL")).toBeNull());
  test("drops technical file-lists with slash-delimited subtitle bullets (0049/0050)", () =>
    expect(asColumnTitles(`Exotica.1994.1080p.BluRay.FLAC2.0.x264-iFT

Technical Information:

RELEASE SiZE...: 15.6 GiB
RUNTiME........: 1 h 43 min
SUBTITLES......: English .srt / English SDH .srt

iMDB...........: https://www.imdb.com/title/tt0109759
ENCODER........: Azevedo
x264 [info]: frame I:727 Avg QP:18.90 size:249839`)).toBeNull());
  test("drops slash-delimited parenthetical notes inside a single release label (1019)", () =>
    expect(asColumnTitles("Power.S03E01.Call.Me.James.1080p.NF.WEBRip.DD5.1.x264-NTb (Source 4K / 1080p Re-Encoded / Netflix / No Logo)")).toBeNull());
  test("uses the last comparison line from a multi-line heading (1266/1267)", () =>
    expect(asColumnTitles(`Jessica Jones S02E01-S02E02
Quick Comparison (no frametypes)
720p @User (L) vs 1080p (R):`)).toEqual(["720p @User (L)", "1080p (R)"]));
  test("drops a single name (no separator → not a comparison title)", () =>
    expect(asColumnTitles("GBR Blu-ray")).toBeNull());
});

describe("ruling: title prefixes are stripped only when they are not source names", () => {
  test("colon title keeps franchise subtitle until a later source suffix (0186)", () =>
    expect(splitNames("Die Hard: With a Vengeance US BD vs CEE BD"))
      .toEqual(["US BD", "CEE BD"]));
  test("colon title strips the whole Title YEAR prefix before a source suffix (1560)", () =>
    expect(splitNames("Captain America: Civil War 2016 Blu-ray vs UHD Blu-ray"))
      .toEqual(["Blu-ray", "UHD Blu-ray"]));
  test("colon episode title strips before capture/source labels (117)", () =>
    expect(splitNames("Sherlock S03E01: 1080p WEB-DL vs 1080i capture"))
      .toEqual(["1080p WEB-DL", "1080i capture"]));
  test("single-word field prefixes stay with the first label (098)", () =>
    expect(splitNames("Frames: Blu-ray Remux 1080p (left) vs WEB-DL AMZN 2016p (right)"))
      .toEqual(["Frames Blu-ray Remux 1080p (left)", "WEB-DL AMZN 2016p (right)"]));
  test("parenthesized year title strips before source labels (0683)", () =>
    expect(splitNames("Looper (2012) 4K WEB-DL vs Blu-ray"))
      .toEqual(["4K WEB-DL", "Blu-ray"]));
  test("title dash prefixes strip to compact region/source labels (2545)", () =>
    expect(splitNames("Mewtwo Strikes Back - Evolution (2019) - JPN vs USA vs AUS"))
      .toEqual(["JPN", "USA", "AUS"]));
  test("per-source labels keep parenthesized year when the tail is a non-parallel source descriptor (2303)", () =>
    expect(stripAsymmetricTitle(["FRA", "GER", "ITA", "Last Night In Soho (2021) EUR Blu-ray"]))
      .toEqual(["FRA", "GER", "ITA", "(2021) EUR Blu-ray"]));
  test("tidies leading visual pipe markers from per-source labels (0725)", () =>
    expect(splitNames("| Amazon Losslessly captured 1080p | iTunes 1080p"))
      .toEqual(["Amazon Losslessly captured 1080p", "iTunes 1080p"]));
});

describe("column-title producers route through asColumnTitles (MODEL.md 3a-continued)", () => {
  test("leading text drops comma-prose before screenshots (0117)", () =>
    expect(namesFromLeadingText(fakeContainer(
      fakeTextNode("For some reason, D+ added black bars to their remaster, but Amazon abandoned them, my comparison is not with the capture."),
      fakeBrNode(),
      fakeBrNode(),
      fakeImageLink(),
    ))).toBeNull());

  test("color spans drop prose rather than treating every span as a source", () =>
    expect(namesFromColorSpans(fakeColorContainer(
      "UK vs. DE: There are lots of parts on DE. For reference, a straight TV capture is included.",
      "Not a source",
    ))).toBeNull());
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
