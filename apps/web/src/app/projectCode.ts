/**
 * A project code suggested from its name: the first letters of up to four
 * words, in Latin capitals (Cyrillic is transliterated), e.g. «Новый
 * мобильный банк» → NMB. A one-word name gives its first four letters. A code
 * already taken (in any case) gets -2, -3 and so on; a name without letters
 * gives PRJ.
 */
const CYRILLIC: Record<string, string> = {
  а: "A", б: "B", в: "V", г: "G", д: "D", е: "E", ё: "E", ж: "ZH", з: "Z", и: "I", й: "Y", к: "K", л: "L", м: "M",
  н: "N", о: "O", п: "P", р: "R", с: "S", т: "T", у: "U", ф: "F", х: "KH", ц: "TS", ч: "CH", ш: "SH", щ: "SCH",
  ъ: "", ы: "Y", ь: "", э: "E", ю: "YU", я: "YA",
};

function latin(word: string) {
  return [...word.toLowerCase()]
    .map((char) => CYRILLIC[char] ?? (/[a-z0-9]/.test(char) ? char.toUpperCase() : ""))
    .join("");
}

export function suggestProjectCode(name: string, takenCodes: Iterable<string>) {
  const words = name
    .split(/[^\p{L}\p{N}]+/u)
    .map(latin)
    .filter(Boolean);
  let base =
    words.length >= 2
      ? words.slice(0, 4).map((word) => word[0]).join("")
      : (words[0] ?? "").slice(0, 4);
  if (base.length < 2) base = "PRJ";
  const taken = new Set([...takenCodes].map((code) => code.toUpperCase()));
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
