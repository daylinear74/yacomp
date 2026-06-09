// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Name-finding strategies                                                  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Reject pipe/vs splits that look like metadata (years, runtimes, dates)
const META_RE = /^(\d{4}|\d+\s*min(?:\/[a-z]+)?|[a-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})$/i;
// A bare mediainfo/BDInfo metric value ("69.36 kbps", "48 kHz", "23.976 fps").
// A real source keeps its name ("Amazon (7755 kbps)"). "bit"/"nits" are
// deliberately excluded — "8-bit"/"10-bit"/"130 nits" are legitimate columns.
// Resolutions like "1080p"/"2160p" are also not matched.
const PURE_MEDIAINFO_VALUE_RE = /^\(?\s*[\d.,]+\s*-?\s*(?:kbps|mbps|kb\/s|mb\/s|k?hz|fps)\s*\)?$/i;
const BITRATE_NOTE_RE = /^\(?\s*~?[\d\s.,]+\s*(?:kbps|mbps|kb\/s|mb\/s)\s*\)?$/i;
const SOURCE_ALIAS_ASSIGNMENT_RE = /^[A-Z0-9]{1,4}\s*=\s*[A-Z0-9]{1,4}$/;
export function looksLikeNames(parts: string[]): boolean {
  if (parts.length < 2) return false;
  if (looksLikeTechnicalParts(parts)) return false;
  if (parts.some((p) => META_RE.test(p.trim()))) return false;
  // A MIX of a bare-metric column ("69.36 kbps") and a non-metric column
  // ("Subtitle: English") is a mediainfo/BDInfo table, not a comparison. An
  // all-source set (no metric columns) or an all-metric set (a genuine bitrate
  // comparison) is left alone.
  const metric = parts.map((p) => PURE_MEDIAINFO_VALUE_RE.test(p.trim()));
  if (metric.some(Boolean) && metric.some((m) => !m)) return false;
  return true;
}

function looksLikeTechnicalParts(parts: string[]): boolean {
  const trimmed = parts.map((part) => part.trim()).filter(Boolean);
  if (trimmed.length < 2) return false;
  if (trimmed.filter((part) => TECH_ASSIGNMENT_RE.test(part)).length >= 2) return true;
  if (trimmed.some((part) => /^:\s*\S/.test(part))) return true;
  const hasBareGenericAssignment = (part: string): boolean =>
    !SOURCE_ALIAS_ASSIGNMENT_RE.test(part) && GENERIC_ASSIGNMENT_RE.test(maskBracketed(part));
  const hasSourceIdentity = (part: string): boolean =>
    SOURCE_TAIL_TOKEN_RE.test(part) || REGION_LEADING_TOKEN_RE.test(part) || SOURCE_ALIAS_ASSIGNMENT_RE.test(part);
  if (trimmed.some(hasBareGenericAssignment) && trimmed.every((part) => !hasSourceIdentity(part))) return true;
  if (trimmed.some((part) => MEDIAINFO_FIELD_RE.test(part)) && trimmed.every((part) => !SOURCE_TAIL_TOKEN_RE.test(part))) return true;
  return trimmed.every((part) => /^(?:format settings|reference frames(?:\s*:.*)?|input\s*=.*|output\s*=.*)$/i.test(part));
}

const GENERIC_HEADING_PREFIX_RE = /^\s*(?:screenshots?\s+comparison|comparison|screenshots?)(?:\s+images?)?(?:\s*\([^)]*\))?\s*:?\s*/i;
// A mediainfo FIELD prefix on a comparison line ("Video: GER … | USA …",
// "Audio: …") merely states what kind of comparison it is — strip it so the
// real source names remain (owner ruling, 2221/2425).
const FIELD_PREFIX_RE = /^\s*(?:video|audio|subtitles?|subs)\s*:\s*/i;
// Comparison separators: "vs", "vs.", "v." — but NOT bare "v" (would match a
// version token). Spaces are required around it in VS_RE so a name's internal
// "v." is left alone.
const VS_RE = /\s+v(?:s\.?|\.)\s+/i;
const VS_TEST = /\bv(?:s\.?|\.)\s/i;
// A "better-than" arrow run (">>>", ">>", "<<") used as a comparison separator,
// e.g. "Eureka Classics >>> Cargo Records" (owner ruling). 2+ arrows only, so a
// single ">" in other text is left alone; a one-sided decorative run yields one
// part (the other side is empty) and is dropped.
const ARROW_RE = /\s*[<>]{2,}\s*/;
const ARROW_TEST = /[<>]{2,}/;
// A "~" used as a comparison separator, e.g. "AMAZON ~ FRA BD" (owner ruling).
// Spaces are required so a "~5GB" size approximation is left alone.
const TILDE_RE = /\s+~\s+/;
const ANGLE_DASH_RE = /\s*>\s*-\s*<\s*/;
const DASH_RE = /\s+-\s+/;
const SLASH_RE = /\s+\/\s+/;
const TIMES_RE = /\s+×\s+/;
const WIDE_SPACE_RE = /\s{3,}/;
const STRUCTURED_LABEL_SELECTOR = 'span[style*="color"], strong, b';
const TECH_ASSIGNMENT_RE = /\b(?:cabac|ref|deblock|analyse|me|subme|psy|psy_rd|mixed_ref|me_range|chroma_me|trellis|8x8dct|cqm|deadzone|fast_pskip|chroma_qp_offset|threads|sliced_threads|nr|decimate|interlaced|bluray_compat|constrained_intra|bframes|b_pyramid|b_adapt|b_bias|direct|weightb|open_gop|weightp|keyint|keyint_min|scenecut|intra_refresh|rc_lookahead|rc|mbtree|bitrate|ratetol|qcomp|qpmin|qpmax|qpstep|cplxblur|qblur|ip_ratio|aq)\s*=/i;
const GENERIC_ASSIGNMENT_RE = /\b[A-Za-z_][A-Za-z0-9_]*\s*=/;
const MEDIAINFO_FIELD_RE = /^(?:id|format(?:\/info| profile| settings)?|codec id(?:\/info)?|duration|bit\s*rate(?: mode)?|bitrate|width|height|display aspect ratio|frame rate(?: mode)?|color space|chroma subsampling|bit depth|scan type|compression mode|stream size|title|language|default|forced|complete name|file size|overall bit rate|writing (?:application|library))\b/i;
const SOURCE_TAIL_TOKEN_RE = /\b(?:source|encode|filtered|web-?dl|webrip|blu-?ray|bd|uhd|hdtv|hd-?dvd|dvd|remux|amzn|amazon|nf|netflix|hulu|itunes|hdr|sdr|avc|hevc|x264|x265|capture|open\s+matte|criterion|mainframe)\b/i;
const SOURCE_LEADING_TOKEN_RE = /^(?:source|encode|filtered|web-?dl|webrip|blu-?ray|bd|uhd|hdtv|hd-?dvd|dvd|remux|amzn|amazon|nf|netflix|hulu|itunes|hdr|sdr|avc|hevc|x264|x265|capture|\d{3,4}[pi])/i;
const REGION_LEADING_TOKEN_RE = /^[A-Z]{2,4}\b/;
const REGIONISH_RE = /^(?:[A-Z]{2,4}|[A-Z]{2,4}\s*\([^)]+\)|[A-Z]{2,4}\s+[A-Z]{2,4}|[A-Z]{2,4}\s+[A-Z]{2,4}\s*\([^)]+\))$/;
const SOURCE_PAIR_RE = /^source\s+([A-Za-z0-9][A-Za-z0-9@._-]{1,30})$/i;

export function isHDBitsRequestsMetadataElement(el: Element): boolean {
  if (el.closest?.("table.table_requests")) return true;
  const label = el.closest?.("div.label");
  return /^requests$/i.test(label?.textContent?.trim() || "");
}

export interface NameLabelInfo {
  names: string[];
  anchorEl: Element;
}

function cleanNameCandidate(text: string): string {
  return text.replace(GENERIC_HEADING_PREFIX_RE, "").replace(FIELD_PREFIX_RE, "")
    // A dangling leading/trailing "|" left after a comparison URL was dropped
    // ("USA, TWN | https://slow.pics/…" → the link removed → "USA, TWN |").
    .replace(/\s*\|\s*$/, "").replace(/^\s*\|\s*/, "").trim();
}

// Strip a leading bbcode/bracket thread-tag such as "[Comparisons] " that
// leaks into the first source label when names are derived from a thread
// title or leading post text. Per project decision we strip ONLY the bracket
// tag — the rest of the label (movie name, year, etc.) is kept verbatim.
const LEADING_TAG_RE = /^\s*\[[^\]]*\]\s*/;

// A forum quote attribution ("Username wrote:") — not a source label.
export function isQuoteAttribution(text: string): boolean {
  const t = text.trim();
  // "… wrote:" at the end (a `p.sub` quote header) OR a leading "User wrote:"
  // prefix folded onto the quoted line ("bananajoe25 wrote:The Handmaid's…", 1009).
  return /\bwrote\s*:?\s*$/i.test(t) || /^\S+\s+wrote\s*:/i.test(t);
}
// A field-label heading ("Short description:", "Long description:") — not a
// source label; the real comparison line usually follows it.
export function isFieldLabel(text: string): boolean {
  return /\bdescription\s*:?\s*$/i.test(text.trim());
}
// A section/footer/structural heading ("See also:", "Slowpics:", "Note:",
// "Summary:", "Logs:", "Quote", "Hidden text", "Spoiler") — never a source label.
const FOOTER_LABEL_RE = /^(?:see\s+also|slow\s?\.?\s?pics?|comparisons?|screenshots?|more\s+screens?|notes?|summary|logs?|edit|update|p\.?\s?s\.?|quote|hidden\s+text|spoilers?|click\s+to\s+\w+)\s*:?\s*$/i;
const DECORATED_STRUCTURAL_LABEL_RE = /^(?:summary|notes?|logs?)\s*[:：].*$/i;
const TECHNICAL_SECTION_LABEL_RE = /\b(?:bd\s*info|eac3to(?:\s+logs?)?|disc\s+menu|special\s+features|technical\s+information)\b/i;
export function isFooterLabel(text: string): boolean {
  const t = text.trim();
  if (/^encode\s+notes?\b/i.test(t)) return true;
  if (DECORATED_STRUCTURAL_LABEL_RE.test(t)) return true;
  return FOOTER_LABEL_RE.test(t);
}
// A leftover BBCode tag ("[/size]", "[color=red]", "[b]") — never part of a
// source name. Matched by a known tag whitelist so a real fully-bracketed
// label like "[NOR 35036 kbps]" is left untouched.
const BBCODE_TAG_RE = /\s*\[\/?(?:size|colou?r|b|i|u|s|url|quote|spoiler|cent(?:er|re)|left|right|img|font|list|code|hr)(?:=[^\]]*)?\]\s*/gi;
// A bare URL — an external comparison/film link, not a source label.
const PURE_URL_RE = /^https?:\/\/\S+$/i;
export function isUrlLabel(text: string): boolean {
  return PURE_URL_RE.test(text.trim());
}
/** Text that should never be used as a source label. */
export function isNonSourceLabel(text: string): boolean {
  return (
    isQuoteAttribution(text) ||
    isFieldLabel(text) ||
    isFooterLabel(text) ||
    TECHNICAL_SECTION_LABEL_RE.test(text) ||
    isUrlLabel(text)
  );
}

/** Prose detector (lives here so any name strategy can guard with it). A
 *  sentence boundary (".", "!", "?" then a capital) or a comma followed by a
 *  lowercase sentence connector marks prose. No length cap — legit release names
 *  run long, and a comma before a CAPITAL/digit (region lists, bitrates) is fine.
 *  Re-exported from parser.ts for back-compat. */
function maskNestedSentencePunctuation(text: string): string {
  let depth = 0;
  let out = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    if (depth > 0 && /[.!?]/.test(ch)) out += " ";
    else out += ch;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
  }
  return out
    .replace(/\b(?:bros|co|corp|inc|ltd)\.\s+/gi, (m) => m.replace(".", " "))
    .replace(/\bshout!\s+factory\b/gi, (m) => m.replace("!", " "));
}

export function looksLikeProse(parts: string[]): boolean {
  return parts.some((p) => {
    const t = maskNestedSentencePunctuation(p.trim());
    return /[.!?]["')\]]?\s+[A-Z]/.test(t) ||
      /,\s+(?:the|a|an|but|and|so|or|latter|former|it|this|which|that|some|i|i'd|i’ll|i'm|i’ve|you|we|one)\b/i.test(t) ||
      /,\s+[A-Z][a-z]+\s+(?:is|are|was|were|has|have|had|can|could|will|would|should)\b/.test(t) ||
      /\s+-\s+[A-Z][a-z]+\s+(?:is|are|was|were|has|have|had|can|could|will|would|should)\b/.test(t) ||
      /\bas you can see\b/i.test(t) ||
      /\bAmazon is also\b/i.test(t);
  });
}

function looksLikeTechnicalFileList(text: string): boolean {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 4) return false;
  const fieldLines = lines.filter((line) =>
    /\.{2,}\s*:/.test(line) ||
    /^(?:technical information|release size|release date|runtime|video codec|framerate|bitrate|aspect ratio|resolution|audio\d*|source|chapters|subtitles|imdb|encoder|x264 \[info\]|notes|greetz)\b/i.test(line),
  );
  return fieldLines.length >= 3;
}

function looksLikeTechnicalSettingsLine(text: string): boolean {
  const slashParts = text.split(SLASH_RE).map((part) => part.trim()).filter(Boolean);
  return slashParts.filter((part) => TECH_ASSIGNMENT_RE.test(part)).length >= 3;
}

function looksLikeToneMappingSettings(parts: string[]): boolean {
  const joined = parts.join(" ");
  if (!/\b(?:nits?|clipped\s+reference|highlight\s+recovery|are\s+you\s+nuts)\b/i.test(joined)) {
    return false;
  }
  return !parts.some((part) =>
    SOURCE_TAIL_TOKEN_RE.test(part) ||
    REGIONISH_RE.test(part) ||
    /\b(?:19|20)\d{2}\b/.test(part) ||
    /\b\d{3,4}p\b/i.test(part) ||
    /\b(?:x26[45]|h\.?26[45]|hevc|avc|vc-?1)\b/i.test(part));
}

function looksLikeCutOnlyLabels(parts: string[]): boolean {
  return parts.length >= 2 && parts.every((part) =>
    /^(?:extended|theatrical|director'?s\s+cut|final\s+cut|unrated|rated|uncut)(?:\s+cut)?$/i.test(part.trim()));
}

function maskBracketed(text: string): string {
  let depth = 0;
  let out = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") {
      depth++;
      out += " ";
      continue;
    }
    if (ch === ")" || ch === "]") {
      depth = Math.max(0, depth - 1);
      out += " ";
      continue;
    }
    out += depth > 0 ? " " : ch;
  }
  return out;
}

function hasTopLevelColumnSeparator(text: string, includeWideSpace = true): boolean {
  const masked = maskBracketed(cleanNameCandidate(text));
  return masked.includes("|") || VS_TEST.test(masked) || ARROW_TEST.test(masked) ||
    ANGLE_DASH_RE.test(masked) || TILDE_RE.test(masked) || masked.includes(",") ||
    DASH_RE.test(masked) || SLASH_RE.test(masked) || TIMES_RE.test(masked) ||
    (includeWideSpace && WIDE_SPACE_RE.test(masked));
}

function columnTitleCandidateText(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return text;
  let best: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!hasVsOrPipe(lines[i])) continue;
    const startsContinuation = /^\s*(?:v(?:s\.?|\.)|\|)(?:\s+|$)/i.test(lines[i]);
    const chunk = startsContinuation && i > 0 ? [lines[i - 1], lines[i]] : [lines[i]];
    let j = i;
    while (
      j + 1 < lines.length &&
      (/\bv(?:s\.?|\.)\s*:?\s*$/i.test(lines[j]) || /^\s*(?:v(?:s\.?|\.)|\|)(?:\s+|$)/i.test(lines[j + 1]))
    ) {
      chunk.push(lines[j + 1]);
      j++;
    }
    best = chunk.join(" ");
    i = j;
  }
  return best ?? text;
}

function looksLikeSingleReleaseWithParentheticalNotes(text: string): boolean {
  if (hasTopLevelColumnSeparator(text, false)) return false;
  if (VS_TEST.test(cleanNameCandidate(text))) return false;
  if (!/[([]/.test(text)) return false;
  return /\b(?:S\d{2}E\d{2}|WEBRip|WEB-DL|Blu-?Ray|x26[45]|DD5(?:\.1)?|Source\s+4K|No Logo|Re-Encoded|Untouched)\b/i.test(text) ||
    /\w+\.\w+\.\w+/.test(text);
}

function stackedBitrateTitleNames(text: string): string[] | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = 1; i < lines.length; i++) {
    if (!VS_TEST.test(lines[i])) continue;
    const metricParts = lines[i].split(VS_RE).map(cleanNamePart).filter(Boolean);
    if (metricParts.length !== 2) continue;

    if (WIDE_SPACE_RE.test(lines[i - 1])) {
      const titleParts = splitNames(lines[i - 1]);
      if (titleParts.length === 2 && BITRATE_NOTE_RE.test(metricParts[1])) {
        const out = [titleParts[0], `${titleParts[1]} ${metricParts[1]}`].map(tidyName);
        if (looksLikeNames(out)) return out;
      }
    } else if (BITRATE_NOTE_RE.test(metricParts[0])) {
      const out = [tidyName(lines[i - 1]), tidyName(metricParts[1])];
      if (looksLikeNames(out)) return out;
    }
  }
  return null;
}

/** THE column-title predicate (MODEL.md). Turn one candidate line into validated
 *  column titles, or null. This is the single place that answers "is this a real
 *  comparison title?" — short, has an explicit separator, splits into
 *  source-like names, and is NOT prose / a quote attribution / a field or footer
 *  label / a URL. Strategies route candidates through this instead of
 *  re-deriving a partial guard set (the missing `looksLikeProse` is what let
 *  0117's "For some reason, D+ added black bars…" split into bogus columns, and a
 *  mid-string "user wrote:" is what produced 1009). */
export function asColumnTitles(text: string): string[] | null {
  const raw = text.trim();
  // No length cap: a legit 6-column title with bitrates runs long (2245), and
  // prose is rejected semantically below, not by length.
  if (!raw) return null;
  if (TECHNICAL_SECTION_LABEL_RE.test(raw)) return null;
  if (/\bvideo size\s*:/i.test(raw)) return null;
  if (looksLikeTechnicalFileList(raw) || looksLikeTechnicalSettingsLine(raw)) return null;
  const stacked = stackedBitrateTitleNames(raw);
  if (stacked) return stacked;
  const t = columnTitleCandidateText(raw).trim();
  if (!t) return null;
  // Whole-line prose check BEFORE splitting: when the separator is a comma,
  // splitting removes the comma-connector signal from each part, so the
  // per-part check below would miss it (0117). Mask the "v."/"vs." separator
  // first — its period otherwise reads as a sentence boundary ("… v. Capture"),
  // which would wrongly flag the 0288 footnote ruling as prose.
  const prosePeek = t.replace(/\.{3,}/g, " ").replace(/\s+v(?:s\.?|\.)\s+/gi, " ");
  if (isNonSourceLabel(t) || looksLikeProse([prosePeek])) return null;
  if (looksLikeSingleReleaseWithParentheticalNotes(t)) return null;
  const sourcePair = t.match(SOURCE_PAIR_RE);
  if (sourcePair) return ["Source", tidyName(sourcePair[1])];
  if (!hasVsOrPipe(t)) return null;
  const names = splitNames(t);
  if (names.length < 2) return null;
  if (names.some(isNonSourceLabel)) return null;
  if (looksLikeCutOnlyLabels(names)) return null;
  if (looksLikeToneMappingSettings(names)) return null;
  if (!looksLikeNames(names) || looksLikeProse(names)) return null;
  return names;
}

function cleanNamePart(text: string): string {
  // A source label is a single line; anything after a hard line break is
  // spillover from the next element (most commonly the first screenshot's
  // frame-row index, e.g. "…madVRhdrMeasure165 \n \n \n1").
  let s = text.replace(/[\r\n][\s\S]*$/, "");
  // Strip a leading bracket thread-tag ("[Comparisons] Movie" → "Movie"), but
  // only when text survives — a fully-bracketed label such as "[NOR 35036 kbps]"
  // is itself the source name and must be kept verbatim, brackets included.
  const detagged = s.replace(LEADING_TAG_RE, "");
  if (detagged.trim()) s = detagged;
  // Strip leftover BBCode tags ("PCOK [/size]" → "PCOK").
  s = s.replace(BBCODE_TAG_RE, " ").trim();
  // Drop a trailing link appended to a real label ("Blu-ray https://…" → "Blu-ray")
  // and a stray trailing colon ("Amazon 1080p (8.4Mbps):" → "Amazon 1080p (8.4Mbps)").
  s = s.replace(/\s+https?:\/\/\S+\s*$/i, "");
  s = s.replace(/^([A-Za-z]+s?):\s+/, "$1 ");
  s = s.replace(/\s*:\s*$/, "");
  // HDBits uploaders sometimes write centered labels as
  // "< SOURCE >-< Encode >-< Alt >", where the angle brackets are decorative.
  s = s.replace(/^\s*<\s*/, "").replace(/\s*>\s*$/, "");
  // Dot leaders are visual spacing in labels ("POL ...... vs ...... US").
  s = s.replace(/\.{3,}/g, " ");
  return s.replace(/^-+|-+$/g, "").trim();
}

// A label part that is purely a file size, e.g. "2.46 GB", "5.25 GiB",
// "(1.83 GB)". The size belongs to the source it sits next to — it is not a
// separate comparison column — so it gets folded into the preceding label.
const PURE_SIZE_RE = /^\(?\s*(\d+(?:\.\d+)?\s*[KMGT]i?B)\s*\)?$/i;

function sizeOf(part: string): string | null {
  const m = part.trim().match(PURE_SIZE_RE);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

/** Final tidy applied to EVERY source name, including those from paths that
 *  bypass cleanNamePart (color spans, bold tags, group labels): strip leftover
 *  BBCode, a trailing comparison URL, and a stray trailing colon, and collapse
 *  whitespace runs. Never returns empty (falls back to the trimmed original). */
export function tidyName(s: string): string {
  const t = s
    .replace(BBCODE_TAG_RE, " ")
    .replace(/\s+https?:\/\/\S+\s*$/i, "")
    .replace(/\s*:\s*$/, "")
    // Decorative arrow runs (2+ angle brackets) around a label: "BD <<<<<",
    // ">>>>> AMZN" → "BD" / "AMZN".
    .replace(/^\s*[<>]{2,}\s*/, "")
    .replace(/\s*[<>]{2,}\s*$/, "")
    .replace(/^\s*\|\s*/, "")
    .replace(/\s*\|\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t || s.trim();
}

/** Fold any pure-file-size part into the preceding source label as a
 *  parenthesized suffix:
 *    ["WEBRip NTb … x264", "2.46 GB"] → ["WEBRip NTb … x264 (2.46 GB)"] */
function foldFileSizeParts(parts: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    const size = sizeOf(p);
    if (size && out.length) {
      out[out.length - 1] = `${out[out.length - 1]} (${size})`;
    } else {
      out.push(p);
    }
  }
  return out;
}

/** Fold a trailing file size that is part of a single source label —
 *  "WEBRip … x264 - 2.46 GB" / "WEBRip … x264 2.46 GB" → "WEBRip … x264 (2.46 GB)".
 *  A size already in parentheses is left untouched. */
export function foldTrailingSize(label: string): string {
  const m = label.match(/^(.*\S)[\s-]+(\d+(?:\.\d+)?\s*[KMGT]i?B)\s*$/i);
  if (!m) return label;
  const base = m[1].replace(/\s*[-–]\s*$/, "").trim();
  return base ? `${base} (${m[2].replace(/\s+/g, " ").trim()})` : label;
}

/** Strip a leading "Movie Title (YYYY) - " from the FIRST source of a split
 *  label, e.g. "Blue City (1986) - USA (Vinegar Syndrome)" → "USA (Vinegar
 *  Syndrome)". Only the high-confidence "(4-digit year) - " shape is removed, so
 *  a genuine source like "GER (2009)" (no trailing " - ") is left untouched. */
function stripLeadingMovieTitle(s: string): string {
  const m = s.match(/^.*\(\d{4}\)\s*[-–]\s+(\S.*)$/);
  return m ? m[1].trim() : s;
}

// A "Movie Title YEAR …" prefix: ≥1 word, then a standalone 1900-2099 year (NOT
// a parenthesised "(2009)" region year).
const TITLE_YEAR_RE = /^.+?\s(?:19|20)\d{2}(?:\s|$)/;
// A bare source code (region "GBR"/"USA", or a short format like "1080p BD") —
// ≤2 words, ≤14 chars, no parens/sentence clutter.
function isSimpleCode(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 14 && !/[()]/.test(t) &&
    /[A-Za-z0-9]/.test(t) && t.split(/\s+/).length <= 2;
}
// Two codes share a shape when both are pure-alpha (region codes) or both carry
// a digit (resolution/format) — so a trimmed trailing token is only accepted as
// the parallel source code when it actually looks like the reference.
function sameCodeShape(a: string, b: string): boolean {
  const alpha = (s: string) => /^[A-Za-z][A-Za-z\s-]*$/.test(s.trim());
  const digit = (s: string) => /\d/.test(s);
  return (alpha(a) && alpha(b)) || (digit(a) && digit(b));
}

function isSourceTail(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 72 || looksLikeProse([t])) return false;
  return SOURCE_TAIL_TOKEN_RE.test(t) || REGIONISH_RE.test(t);
}

function isStandaloneSourceTail(s: string): boolean {
  const t = s.trim();
  if (!isSourceTail(t)) return false;
  if (TITLE_YEAR_RE.test(t) || /^.+?\(\d{4}\)/.test(t) || /:/.test(t)) return false;
  return t.split(/\s+/).length <= 5 || REGIONISH_RE.test(t);
}

function tailByWordCount(s: string, ref: string): string | null {
  const words = s.trim().split(/\s+/);
  const refWords = Math.max(1, ref.trim().split(/\s+/).length);
  for (let count = refWords; count <= Math.min(refWords + 2, words.length - 1); count++) {
    const tail = words.slice(-count).join(" ");
    if (isSourceTail(tail)) return tail;
  }
  return null;
}

function titleSourceTail(s: string, ref: string): string | null {
  const t = s.trim();
  const parenYear = t.match(/^.+?\(\d{4}\)\s*(?:[-–]\s*)?(\S.*)$/);
  if (parenYear) {
    const after = parenYear[1].trim();
    const sourceWithYear = t.match(/^.+?(\(\d{4}\)\s*(?:[-–]\s*)?\S.*)$/)?.[1]?.trim();
    const wordTail = tailByWordCount(after, ref);
    if (wordTail && REGIONISH_RE.test(wordTail) && REGIONISH_RE.test(ref.trim())) return wordTail;
    if (sourceWithYear && REGIONISH_RE.test(ref.trim()) && isSourceTail(after) && !REGIONISH_RE.test(after)) {
      return sourceWithYear;
    }
    if (isSourceTail(after)) return after;
  }

  const plainYear = t.match(/^.+?\s(?:19|20)\d{2}\s+(\S.*)$/);
  if (plainYear) {
    const after = plainYear[1].trim();
    const wordTail = tailByWordCount(after, ref);
    if (wordTail && REGIONISH_RE.test(wordTail) && REGIONISH_RE.test(ref.trim())) return wordTail;
    if (isSourceTail(after)) return after;
  }

  const colon = t.lastIndexOf(":");
  if (colon >= 0) {
    const before = t.slice(0, colon).trim();
    if (/^[A-Za-z]+s?$/i.test(before)) return null;
    const after = t.slice(colon + 1).trim();
    if (
      isSourceTail(after) &&
      after.split(/\s+/).length <= 5 &&
      (SOURCE_LEADING_TOKEN_RE.test(after) || REGION_LEADING_TOKEN_RE.test(after))
    ) return after;
    const afterTail = tailByWordCount(after, ref);
    if (afterTail) return afterTail;
    const afterYear = after.match(/^.+?\s(?:19|20)\d{2}\s+(\S.*)$/);
    if (afterYear && isSourceTail(afterYear[1])) return afterYear[1].trim();
    const sourceWord = after.search(SOURCE_TAIL_TOKEN_RE);
    if (sourceWord >= 0) {
      const sourceTail = after.slice(sourceWord).trim();
      if (isSourceTail(sourceTail)) return sourceTail;
    }
  }

  return null;
}
/** Strip a shared "Title YEAR …" prefix from columns that carry it ONLY when the
 *  set is ASYMMETRIC — at least one column has the prefix and at least one does
 *  not (owner ruling). Each titled column is trimmed to the trailing tokens that
 *  parallel the short untitled reference column, and the result is accepted only
 *  when every trimmed token is a simple code of the same shape as the reference
 *  ("Betty 1992 1080p Remux GBR" / "USA" → "GBR" / "USA"). Symmetric full
 *  release-name pairs (1313) and long names whose trailing tokens are clutter
 *  ("…(latest madVR test build (113)") are left untouched. */
export function stripAsymmetricTitle(parts: string[]): string[] {
  if (parts.length < 2) return parts;
  const refs = parts.filter(isStandaloneSourceTail);
  if (refs.length) {
    const ref = refs[0];
    const out = parts.map((p) => isStandaloneSourceTail(p) ? p : titleSourceTail(p, ref) ?? p);
    if (out.some((p, i) => p !== parts[i]) && out.every(isStandaloneSourceTail)) return out;
  }

  const titled = parts.map((p) => TITLE_YEAR_RE.test(p.trim()));
  if (!titled.some(Boolean) || titled.every(Boolean)) return parts;
  const ref = parts[titled.findIndex((t) => !t)].trim();
  if (!isSimpleCode(ref)) return parts;
  const refWords = ref.split(/\s+/).length;
  const out = parts.map((p, i) => {
    if (!titled[i]) return p;
    const words = p.trim().split(/\s+/);
    return words.length > refWords ? words.slice(-refWords).join(" ") : p;
  });
  for (let i = 0; i < parts.length; i++) {
    if (!titled[i]) continue;
    if (out[i] === parts[i] || !isSimpleCode(out[i]) || !sameCodeShape(out[i], ref)) return parts;
  }
  return out;
}

/** Replace every character inside (...) / [...] with a neutral 'x', preserving
 *  length and the brackets themselves — so a separator that lives inside a
 *  parenthesised aside (e.g. the "|" in "Source (Carlotta | FRA)") is invisible
 *  to top-level separator detection. */
function maskParens(s: string): string {
  let depth = 0, out = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") { depth++; out += ch; }
    else if (ch === ")" || ch === "]") { depth = Math.max(0, depth - 1); out += ch; }
    else out += depth > 0 ? "x" : ch;
  }
  return out;
}

/** Split `s` at TOP-LEVEL occurrences of `sep` (those outside any parens),
 *  located via the parens-masked copy but sliced from the original. Returns null
 *  when there is no top-level occurrence. */
function topLevelSplit(s: string, sep: string | RegExp): string[] | null {
  const mask = maskParens(s);
  const re = typeof sep === "string"
    ? new RegExp(sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
    : new RegExp(sep.source, sep.flags.includes("g") ? sep.flags : sep.flags + "g");
  const cuts: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(mask)) !== null) {
    cuts.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++;
  }
  if (!cuts.length) return null;
  const parts: string[] = [];
  let last = 0;
  for (const [a, b] of cuts) { parts.push(s.slice(last, a)); last = b; }
  parts.push(s.slice(last));
  return parts;
}

/** True when every ( / [ has a matching close. Top-level separator detection
 *  relies on paren depth, so a malformed/unbalanced label (e.g. a missing close
 *  paren) must fall back to the plain split instead. */
function parensBalanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") { if (--depth < 0) return false; }
  }
  return depth === 0;
}

function plainSplit(c: string): string[] {
  if (c.includes("|")) return c.split("|");
  if (VS_TEST.test(c)) return c.split(VS_RE);
  if (ARROW_TEST.test(c)) return c.split(ARROW_RE);
  if (ANGLE_DASH_RE.test(c)) return c.split(ANGLE_DASH_RE);
  if (WIDE_SPACE_RE.test(c)) return c.split(WIDE_SPACE_RE);
  if (c.includes(",")) return c.split(",");
  if (DASH_RE.test(c)) return c.split(DASH_RE);
  if (SLASH_RE.test(c)) return c.split(SLASH_RE);
  if (TILDE_RE.test(c)) return c.split(TILDE_RE);
  if (TIMES_RE.test(c)) return c.split(TIMES_RE);
  return [c];
}

/** Unwrap a label ENTIRELY enclosed in one balanced paren group, e.g.
 *  "(Remux / RandomBytes)" → "Remux / RandomBytes", so the inner separator
 *  becomes top-level. A label whose first "(" closes before the end ("(A) vs
 *  (B)") or that isn't paren-wrapped is returned unchanged. */
function unwrapOuterParens(text: string): string {
  const t = text.trim();
  if (t.length < 2 || t[0] !== "(" || t[t.length - 1] !== ")") return text;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")" && --depth === 0 && i !== t.length - 1) return text;
  }
  return depth === 0 ? t.slice(1, -1).trim() : text;
}

export function splitNames(text: string): string[] {
  // Repair a separator "vs" with a missing space on either/both sides
  // ("GERvsUSA", "A vsB", "…Sharp)vsPhantom Thread…") so it is detected. Only a
  // LOWERCASE "vs" bounded by token chars / "(" / ")" is touched, so a name's
  // own "VS" / "AVS" (AviSynth) stays intact.
  const candidate = unwrapOuterParens(cleanNameCandidate(text))
    .replace(/([A-Za-z0-9)\]])vs(?=[A-Z(]|\s)/g, "$1 vs ")
    .replace(/(\s)vs(?=[A-Z(])/g, "$1vs ");
  // Prefer a TOP-LEVEL separator (one outside parentheses), but only when the
  // label's parens are balanced (else masking is unreliable). When no top-level
  // separator exists, fall back to a plain split — which lets a paren-enclosed
  // source list like "E01 (DE, ES, FR, UK, US)" split on its inner commas.
  const topLevel = parensBalanced(candidate)
    ? topLevelSplit(candidate, "|") ??
      topLevelSplit(candidate, VS_RE) ??
      topLevelSplit(candidate, ARROW_RE) ??
      topLevelSplit(candidate, ANGLE_DASH_RE) ??
      topLevelSplit(candidate, WIDE_SPACE_RE) ??
      topLevelSplit(candidate, ",") ??
      topLevelSplit(candidate, DASH_RE) ??
      topLevelSplit(candidate, SLASH_RE) ??
      // "~" is the LOWEST-precedence separator: a spaced tilde is only the
      // comparison divider when nothing stronger splits the line. When a "/"
      // (or vs/|) already separates two "REGION ~ distributor" units
      // ("GBR ~ BFI / USA ~ CC", 2241) the "~" is a sub-connector, not a split.
      topLevelSplit(candidate, TILDE_RE) ??
      topLevelSplit(candidate, TIMES_RE)
    : null;
  let parts = (topLevel ?? plainSplit(candidate)).map(cleanNamePart).filter(Boolean);
  // Strip a "Movie Title (YYYY) - " prefix that clings to the first source when
  // the whole comparison line led with the film name.
  if (parts.length >= 2) parts[0] = stripLeadingMovieTitle(parts[0]);
  // A bare-URL part is an external link, not a source column — drop it.
  parts = parts.filter((p) => !isUrlLabel(p));
  parts = stripAsymmetricTitle(parts);
  return foldFileSizeParts(parts);
}

/** True when the label is itself a list of 2+ sources joined by a TOP-LEVEL
 *  comma or an explicit vs/|/ ÷ separator (e.g. "Source (Carlotta | FRA), Geek,
 *  TayTO (TWN)"). A single source that merely contains a dash ("release - AC3
 *  5.1 - size", the 0835 shape) is NOT multi-source. Used to stop the
 *  per-group-label transpose from treating two SECTION labels as columns. */
export function isMultiSourceLabel(label: string): boolean {
  const c = cleanNameCandidate(label);
  const masked = parensBalanced(c) ? maskParens(c) : c;
  const hasMultiSep =
    masked.includes("|") || VS_TEST.test(masked) || ANGLE_DASH_RE.test(masked) || SLASH_RE.test(masked) ||
    TIMES_RE.test(masked) || masked.includes(",");
  if (!hasMultiSep) return false;
  const parts = splitNames(label);
  return parts.length >= 2 && looksLikeNames(parts);
}

export function hasVsOrPipe(text: string): boolean {
  const candidate = cleanNameCandidate(text);
  return candidate.includes("|") || VS_TEST.test(candidate) || ARROW_TEST.test(candidate) || ANGLE_DASH_RE.test(candidate) || TILDE_RE.test(candidate) || candidate.includes(",") || DASH_RE.test(candidate) || SLASH_RE.test(candidate) || TIMES_RE.test(candidate) || WIDE_SPACE_RE.test(candidate);
}

/** An UNAMBIGUOUS multi-source separator ("X vs Y", "X | Y", "X / Y", "X × Y").
 *  Unlike {@link hasVsOrPipe} this excludes DASH and COMMA, which routinely
 *  appear inside a single source name (e.g. "release - AC3 5.1 - 1.06 GiB",
 *  "Disc Title: X, The" / "45,862 bytes"). Used to decide when a per-group
 *  label introduces a *separate* comparison vs. is itself one source column of
 *  a single transposed grid. */
export function hasExplicitComparison(text: string): boolean {
  const candidate = cleanNameCandidate(text);
  return candidate.includes("|") || VS_TEST.test(candidate) || ARROW_TEST.test(candidate) || ANGLE_DASH_RE.test(candidate) || TILDE_RE.test(candidate) || SLASH_RE.test(candidate) || TIMES_RE.test(candidate) || WIDE_SPACE_RE.test(candidate);
}

// ── Name-finding sub-strategies ──

/** Scan bold tags (reverse order) for vs/pipe labels, skipping links */
export function nameLabelInfoFromBoldTags(tags: Element[]): NameLabelInfo | null {
  for (let i = tags.length - 1; i >= 0; i--) {
    if (tags[i].closest("a")) continue;
    if (isHDBitsRequestsMetadataElement(tags[i])) continue;
    // Route through the single column-title predicate — this adds the
    // looksLikeProse guard the old inline check lacked (0117/1009 false positives).
    const names = asColumnTitles(tags[i].textContent!);
    if (names) return { names, anchorEl: tags[i] };
  }
  return null;
}

export function namesFromBoldTags(tags: Element[]): string[] | null {
  return nameLabelInfoFromBoldTags(tags)?.names ?? null;
}

/** Strategy 1: preceding siblings' bold tags */
export function namesFromSiblingInfo(container: Element): NameLabelInfo | null {
  let sib = container.previousElementSibling;
  for (let steps = 0; steps < 8 && sib; steps++, sib = sib.previousElementSibling) {
    if (sib.nodeName === "BR") continue;
    const tags: Element[] = sib.matches?.("strong, b") ? [sib] : [];
    tags.push(...(sib.querySelectorAll?.("strong, b") || []));
    const found = nameLabelInfoFromBoldTags(tags);
    if (found) return found;
  }
  return null;
}

export function namesFromSiblings(container: Element): string[] | null {
  return namesFromSiblingInfo(container)?.names ?? null;
}

/** Strategy 2: container's leading text (text nodes + non-image links) */
export function namesFromLeadingText(container: Element): string[] | null {
  let leadingText = "";
  for (const node of container.childNodes) {
    if (node.nodeName === "A") {
      if ((node as Element).querySelector("img")) break;
      leadingText += node.textContent;
    } else if (node.nodeType === 3) {
      leadingText += node.textContent;
    } else if (node.nodeName === "BR") {
      leadingText += " ";
    } else {
      break;
    }
  }
  leadingText = leadingText.trim();
  return leadingText ? asColumnTitles(leadingText) : null;
}

/** Strategy 2b: color-coded span labels */
export function namesFromColorSpans(container: Element): string[] | null {
  const colorSpans = [...container.querySelectorAll('span[style*="color"]')]
    .filter((span) => !isHDBitsRequestsMetadataElement(span));
  if (colorSpans.length >= 2) {
    const csNames = colorSpans
      .map((s) => s.textContent!.trim())
      .filter((text) => !isNonSourceLabel(text))
      .filter(Boolean);
    if (csNames.length >= 2) {
      const names = asColumnTitles(csNames.join(" | "));
      if (names?.length === csNames.length) return names;
    }
  }
  return null;
}

function leadingStructuredLabelNodes(container: Element): Element[] {
  const labels: Element[] = [];
  for (const node of container.childNodes) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.matches("a") && el.querySelector("img")) break;
    if (el.querySelector("a img, img")) break;

    if (el.matches(STRUCTURED_LABEL_SELECTOR)) {
      if (!isHDBitsRequestsMetadataElement(el) && !isNonSourceLabel(el.textContent!.trim())) labels.push(el);
      continue;
    }

    const nested = [...el.querySelectorAll(STRUCTURED_LABEL_SELECTOR)]
      .filter((candidate) => !candidate.parentElement?.closest(STRUCTURED_LABEL_SELECTOR))
      .filter((candidate) => !isHDBitsRequestsMetadataElement(candidate))
      .filter((candidate) => !isNonSourceLabel(candidate.textContent!.trim()));
    labels.push(...nested);
  }
  return labels;
}

export function namesFromLeadingStructuredLabels(container: Element, expectedCount: number): NameLabelInfo | null {
  const labels = leadingStructuredLabelNodes(container);
  if (labels.length !== expectedCount) return null;

  const names = labels
    .map((label, index) => {
      const text = label.textContent!.trim();
      return index > 0 ? text.replace(/^\s*v(?:s\.?|\.)\s+/i, "") : text;
    })
    .filter(Boolean);
  if (names.some(isNonSourceLabel)) return null;
  if (names.length !== expectedCount || !looksLikeNames(names)) return null;

  return { names, anchorEl: labels[labels.length - 1] };
}

/** Strategy 2c: bold/strong tags that are direct children of the container
 *  appearing before the first image link — these are inline source labels */
export function namesFromLeadingBoldTags(container: Element): string[] | null {
  const bolds: string[] = [];
  for (const node of container.childNodes) {
    if (node.nodeName === "A" && (node as Element).querySelector("img")) break;
    if (node.nodeName === "STRONG" || node.nodeName === "B") {
      if (isHDBitsRequestsMetadataElement(node as Element)) continue;
      const raw = node.textContent!.trim();
      const t = bolds.length ? raw.replace(/^\s*v(?:s\.?|\.)\s+/i, "") : raw;
      if (t && !isNonSourceLabel(t)) bolds.push(t);
    }
  }
  return bolds.length >= 2 ? bolds : null;
}

/** Strategy 3: bold tags in ancestor elements */
export function namesFromAncestors(container: Element): string[] | null {
  let el: Element | null = container;
  for (let up = 0; up < 8 && el; up++, el = el.parentElement) {
    const tags = [...el.querySelectorAll("strong, b")]
      .filter((tag) => !isHDBitsRequestsMetadataElement(tag));
    if (tags.length) {
      const found = namesFromBoldTags(tags);
      if (found) return found;
    }
  }
  return null;
}

/** Strip movie title prefix from an H1 heading text. A leading bbcode/bracket
 *  thread-tag ("[Comparisons] ") is always removed first; the remaining
 *  movie-name/year prefix is left intact per project decision. */
function stripTitlePrefix(text: string): string {
  const tagless = text.replace(LEADING_TAG_RE, "");
  const colon = tagless.lastIndexOf(":");
  if (colon >= 0) {
    const after = tagless.substring(colon + 1).trim();
    if (after && hasVsOrPipe(after)) return after;
  }
  const dash = tagless.lastIndexOf(" - ");
  if (dash >= 0) return tagless.substring(dash + 3).trim();
  const ym = tagless.match(/\(\d{4}\)\s*/);
  if (ym) {
    const after = tagless.substring(ym.index! + ym[0].length).trim();
    if (after) return after;
  }
  return tagless.trim();
}

/** Strategy 4: H1 headings (forum comparison threads) */
export function namesFromHeadings(): string[] | null {
  for (const h1 of document.querySelectorAll("h1")) {
    let text = h1.textContent!.trim();
    const gt = text.lastIndexOf(">");
    if (gt >= 0) text = text.substring(gt + 1).trim();

    if (text.includes("|")) {
      const label = stripTitlePrefix(text);
      if (label.includes("|")) {
        const parts = splitNames(label);
        if (parts.every((p) => p) && looksLikeNames(parts)) return parts;
      }
    }

    if (VS_TEST.test(text)) {
      let parts = text.split(VS_RE).map((n) => n.trim());
      parts[0] = stripTitlePrefix(parts[0]);
      parts = stripAsymmetricTitle(parts);
      if (parts.every((p) => p) && looksLikeNames(parts)) return parts;
    }
  }
  return null;
}

/** The thread/topic H1 title describes the ORIGINAL post's comparison, not a
 *  reply's. A reply that re-uses the same screenshots-with-no-local-label shape
 *  must NOT inherit "Movie (2008) GER vs FRA" from the H1 (owner ruling, 1293).
 *  True for the first post, and for non-forum pages (torrent description/comment,
 *  single-post renders) which have no reply structure. */
export function isOriginalPost(container: Element): boolean {
  const posts = [...document.querySelectorAll("td.comment")];
  if (posts.length <= 1) return true;
  const first = posts[0];
  return first === container || first.contains(container) || container.contains(first);
}

export function findComparisonNames(container: Element): string[] | null {
  return (
    namesFromSiblings(container) ||
    namesFromLeadingText(container) ||
    namesFromColorSpans(container) ||
    namesFromLeadingBoldTags(container) ||
    namesFromAncestors(container) ||
    (isOriginalPost(container) ? namesFromHeadings() : null)
  );
}
