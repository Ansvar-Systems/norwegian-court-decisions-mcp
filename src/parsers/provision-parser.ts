/**
 * Parse Norwegian statute text into structured provisions.
 *
 * Detects and handles:
 *   - Chaptered statutes: "Kapittel 3 § 13" or "3 kap. § 13" → provision_ref "3:13"
 *   - Flat statutes: "§ 13" → provision_ref "13"
 *   - Special numbering: "§ 5 a" → provision_ref "5 a"
 *
 * NOTE: Norwegian statutes use § before the number (§ 13) rather than after
 * (13 §) as in Swedish. Some older formatting uses Swedish-style; both are handled.
 */

/** Parsed provision from raw statute text */
export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
}

/** Section pattern: "§ 13" or "§ 13 a" (Norwegian: § before number) */
const SECTION_PATTERN = /^§\s*(\d+\s*[a-z]?)\s*(.*)/;

/** Legacy Swedish-style section: "13 §" (still appears in some older Norwegian laws) */
const SECTION_PATTERN_LEGACY = /^(\d+\s*[a-z]?)\s*§\s*(.*)/;

/** Rubrikk (heading) pattern */
const RUBRIK_PATTERN = /^[A-ZÆØÅ][a-zæøå]+(?: [a-zæøå]+)*$/;

/**
 * Parse raw Norwegian statute text into structured provisions.
 *
 * @param text - Full statute text
 * @returns Array of parsed provisions
 */
export function parseStatuteText(text: string): ParsedProvision[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const provisions: ParsedProvision[] = [];

  let currentChapter: string | undefined;
  let currentSection: string | undefined;
  let currentTitle: string | undefined;
  let currentContent: string[] = [];

  function flush(): void {
    if (currentSection && currentContent.length > 0) {
      const provisionRef = currentChapter
        ? `${currentChapter}:${currentSection}`
        : currentSection;

      provisions.push({
        provision_ref: provisionRef,
        chapter: currentChapter,
        section: currentSection,
        title: currentTitle,
        content: currentContent.join(' '),
      });
    }
    currentSection = undefined;
    currentTitle = undefined;
    currentContent = [];
  }

  for (const line of lines) {
    // Check for chapter heading: "Kapittel 3" or "3 kap."
    const chapterMatch = line.match(/^(?:[Kk]apittel\s+(\d+)|(\d+)\s*kap\.)/);
    if (chapterMatch) {
      flush();
      currentChapter = (chapterMatch[1] || chapterMatch[2]);
      continue;
    }

    // Check for section start: "§ 13" (Norwegian style, preferred)
    const sectionMatch = line.match(SECTION_PATTERN);
    if (sectionMatch) {
      flush();
      currentSection = sectionMatch[1].replace(/\s+/g, ' ').trim();
      const remainder = sectionMatch[2].trim();
      if (remainder) {
        currentContent.push(remainder);
      }
      continue;
    }

    // Check for legacy section: "13 §" (Swedish-style, still found in older laws)
    const legacySectionMatch = line.match(SECTION_PATTERN_LEGACY);
    if (legacySectionMatch) {
      flush();
      currentSection = legacySectionMatch[1].replace(/\s+/g, ' ').trim();
      const remainder = legacySectionMatch[2].trim();
      if (remainder) {
        currentContent.push(remainder);
      }
      continue;
    }

    // Check for rubrikk (title) — only if just started a new section with no content yet
    if (currentSection && currentContent.length === 0 && RUBRIK_PATTERN.test(line)) {
      currentTitle = line;
      continue;
    }

    // Regular content line
    if (currentSection) {
      currentContent.push(line);
    }
  }

  flush();
  return provisions;
}

/**
 * Detect if a statute uses chapters (chaptered) or not (flat).
 */
export function isChapteredStatute(text: string): boolean {
  return /(?:[Kk]apittel\s+\d+|\d+\s*kap\.)/.test(text);
}
