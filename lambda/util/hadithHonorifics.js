/**
 * Hadith text coming from https://cdn.mawaqit.net/ahadith/{lang}.xml embeds a
 * handful of Arabic honorific formulas (e.g. صَلَّى اللهُ عَلَيْهِ وَسَلَّمَ,
 * رَضِيَ اللهُ عَنْهُ) even in non-Arabic languages. Alexa cannot pronounce
 * Arabic, so these are dropped from the spoken output.
 *
 * This module replaces each formula with its translation in the target
 * language. Matching is diacritic-insensitive because the source uses variable
 * tashkil (e.g. رَضِيَ vs رّضِيَ vs رضي).
 */

const FALLBACK_LANG = "en";

// Anything that decorates the base letters but must not break a match:
// Arabic diacritics (tashkil), superscript alef, tatweel, zero-width marks and
// regular whitespace (the formulas span several words).
const FILLER = "[\\u064B-\\u0652\\u0670\\u0640\\u200E\\u200F\\s]*";

// Longest / most specific formulas first so a shorter one (e.g. عنه) never
// consumes the prefix of a longer one (e.g. عنهما).
const HONORIFICS = [
  {
    id: "radiyallahu_anhuma",
    base: "رضي الله عنهما",
    translations: {
      en: "may Allah be pleased with them both",
      fr: "qu'Allah soit satisfait d'eux deux",
      de: "möge Allah mit ihnen beiden zufrieden sein",
      es: "que Allah esté complacido con ambos",
      nl: "moge Allah tevreden met hen beiden zijn",
      pt: "que Allah esteja satisfeito com ambos",
      tr: "Allah ikisinden de razı olsun",
    },
  },
  {
    id: "radiyallahu_anhum",
    base: "رضي الله عنهم",
    translations: {
      en: "may Allah be pleased with them",
      fr: "qu'Allah soit satisfait d'eux",
      de: "möge Allah mit ihnen zufrieden sein",
      es: "que Allah esté complacido con ellos",
      nl: "moge Allah tevreden met hen zijn",
      pt: "que Allah esteja satisfeito com eles",
      tr: "Allah onlardan razı olsun",
    },
  },
  {
    id: "radiyallahu_anha",
    base: "رضي الله عنها",
    translations: {
      en: "may Allah be pleased with her",
      fr: "qu'Allah soit satisfait d'elle",
      de: "möge Allah mit ihr zufrieden sein",
      es: "que Allah esté complacido con ella",
      nl: "moge Allah tevreden met haar zijn",
      pt: "que Allah esteja satisfeito com ela",
      tr: "Allah ondan razı olsun",
    },
  },
  {
    id: "radiyallahu_anhu",
    base: "رضي الله عنه",
    translations: {
      en: "may Allah be pleased with him",
      fr: "qu'Allah soit satisfait de lui",
      de: "möge Allah mit ihm zufrieden sein",
      es: "que Allah esté complacido con él",
      nl: "moge Allah tevreden met hem zijn",
      pt: "que Allah esteja satisfeito com ele",
      tr: "Allah ondan razı olsun",
    },
  },
  {
    id: "sallallahu_alayhi_wasallam",
    base: "صلى الله عليه وسلم",
    // Ligature form (U+FDFA) that stands for the whole formula.
    ligature: "ﷺ",
    translations: {
      en: "peace be upon him",
      fr: "que la paix et le salut d'Allah soient sur lui",
      de: "Friede und Segen Allahs seien auf ihm",
      es: "la paz y las bendiciones de Allah sean con él",
      nl: "vrede en zegeningen zij met hem",
      pt: "que a paz e as bênçãos de Allah estejam com ele",
      tr: "Allah'ın selamı ve salatı onun üzerine olsun",
    },
  },
];

// Every Arabic letter / presentation-form block, used by the residual cleanup.
const ARABIC_LETTERS =
  "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
const RESIDUAL_ARABIC = new RegExp(`[${ARABIC_LETTERS}]+`, "g");

// Build a diacritic-tolerant regex from the base letters of a formula.
// Consecutive identical letters (e.g. the double lam of "الله") are made
// flexible so that misspelled source variants using a single letter (e.g.
// "الّه") still match.
const buildRegex = (base) => {
  const letters = [...base.replace(/\s+/g, "")];
  const atoms = [];
  for (let i = 0; i < letters.length;) {
    const letter = letters[i];
    let count = 1;
    while (letters[i + count] === letter) count++;
    // Match between 1 and `count` occurrences of this letter.
    atoms.push(
      count === 1 ? letter : `${letter}(?:${FILLER}${letter}){0,${count - 1}}`,
    );
    i += count;
  }
  return new RegExp(atoms.join(FILLER) + FILLER, "g");
};

// Precompile once at module load.
const COMPILED = HONORIFICS.map((entry) => ({
  regex: buildRegex(entry.base),
  ligature: entry.ligature,
  translations: entry.translations,
}));

const pickTranslation = (translations, lang) =>
  translations[lang] || translations[FALLBACK_LANG];

/**
 * Replace every Arabic honorific formula in `text` with its translation in
 * `lang`. Falls back to English when the language is not supported. Unknown
 * text is returned unchanged.
 *
 * @param {string} text - hadith text possibly containing Arabic honorifics
 * @param {string} lang - two-letter language code (e.g. "en", "fr")
 * @returns {string}
 */
const translateHonorifics = (text, lang) => {
  if (!text || typeof text !== "string") {
    return text;
  }

  let result = text;
  for (const { regex, ligature, translations } of COMPILED) {
    const replacement = pickTranslation(translations, lang);
    if (ligature) {
      result = result.split(ligature).join(replacement);
    }
    result = result.replace(regex, replacement);
  }

  // Safety net: strip any Arabic characters left behind (stray orphan letters
  // or unrecognised spelling variants) so nothing unpronounceable reaches Alexa.
  result = result.replace(RESIDUAL_ARABIC, "");

  // Collapse whitespace left behind by multi-line source formatting and by the
  // replacements above.
  return result
    .replace(/[ \t]+/g, " ")
    .replace(/ +([),.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
};

module.exports = { translateHonorifics, HONORIFICS };
