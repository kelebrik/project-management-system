import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * The palette's text reads on its fills, in both themes: the tokens of
 * tokens.css in the pairs the interface puts them in, and every style rule
 * that fixes both a background and a colour. A guard for the palette, not a
 * measure of what the screen shows: the cascade is not followed here.
 */
const STYLES = join(import.meta.dirname, ".");
const MIN_TEXT_CONTRAST = 4.5;

type Tokens = Map<string, string>;

/** The body of a top-level rule; the header comment names the selectors too, so the rule is found at a line start. */
function block(css: string, selector: string) {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} in tokens.css`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  throw new Error(`unclosed ${selector}`);
}

function declarations(body: string): Tokens {
  const tokens: Tokens = new Map();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(match[1]!, match[2]!.trim());
  return tokens;
}

/** A token's colour, through the tokens it names; a token that names nothing known fails the test. */
function resolve(tokens: Tokens, value: string, seen: string[] = []): string {
  const reference = /^var\((--[\w-]+)\)$/.exec(value.trim()) ?? /^(--[\w-]+)$/.exec(value.trim());
  if (!reference) return value.trim();
  const name = reference[1]!;
  assert.ok(!seen.includes(name), `cycle ${[...seen, name].join(" → ")}`);
  const next = tokens.get(name);
  assert.ok(next, `${name} is not defined`);
  return resolve(tokens, next, [...seen, name]);
}

const tokensCss = readFileSync(join(STYLES, "tokens.css"), "utf8");
const light = declarations(block(tokensCss, ":root"));
const dark: Tokens = new Map([...light, ...declarations(block(tokensCss, '[data-theme="dark"]'))]);
const themes = { light, dark };

function rgb(hex: string) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  assert.ok(match, `${hex} is not a hex colour`);
  const digits = match[1]!.length === 3 ? [...match[1]!].map((digit) => digit + digit).join("") : match[1]!;
  return [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

/** Text on a fill, each a token or a literal colour; checked in every theme. */
const PAIRS: Array<[fill: string, text: string, where: string]> = [
  // Text on the surfaces.
  ...["--bg", "--surface", "--surface-2", "--surface-3", "--surface-tint"].flatMap((surface) =>
    ["--text", "--text-strong", "--text-heading", "--text-secondary", "--text-muted"].map((text): [string, string, string] => [surface, text, "text on surfaces"]),
  ),
  ["--surface", "--brand", "links and accents"],
  ["--brand-soft", "--brand", "chosen filters and tabs"],
  ["--brand-soft", "--text", "chosen rows"],
  ["--brand", "--on-brand", "brand buttons"],
  ["--brand-600", "--on-brand", "brand buttons, hovered"],
  ["--danger", "--on-danger", "danger buttons"],
  ["--danger-700", "--on-danger", "danger buttons, hovered"],
  ["--danger-soft", "--danger-800", "danger notes"],
  ["--danger-bg", "--danger-800", "danger notes"],
  ["--warning-soft", "--warning-800", "warning notes"],
  ["--warning-bg", "--warning-800", "warning notes"],
  ["--success-soft", "--success-800", "success notes"],
  ["--info-soft", "--info-800", "info notes"],
  // The risk matrix and the open issues' priority and readiness.
  ["--danger-soft", "--text-strong", "matrix red"],
  ["--warning-soft", "--text-strong", "matrix amber"],
  ["--success-soft", "--text-strong", "matrix green"],
  ["#ee8b8b", "#111827", "critical issue"],
  // Work statuses: the Gantt's bars and the status cells.
  ...(["#4a86c8", "#9cc3ec", "#95e4b1", "#f5d984", "#ee8b8b", "#a8b4c5"] as const).map((fill): [string, string, string] => [fill, "#111827", `status ${fill}`]),
  ["--inverse-surface", "--on-inverse", "tooltips and dark badges"],
];

for (const [theme, tokens] of Object.entries(themes)) {
  test(`${theme} theme: text reads on its fill in every pair the interface uses`, () => {
    const failures = PAIRS.flatMap(([fill, text, where]) => {
      const ratio = contrast(resolve(tokens, fill), resolve(tokens, text));
      return ratio >= MIN_TEXT_CONTRAST ? [] : [`${where}: ${text} on ${fill} = ${ratio.toFixed(2)}:1`];
    });
    assert.deepEqual(failures, []);
  });
}

/** The rules of a sheet outside its print blocks, as [selector, body]. */
function screenRules(css: string) {
  let screen = "";
  let depth = 0;
  let skipping = false;
  for (let index = 0; index < css.length; index += 1) {
    if (!skipping && css.startsWith("@media print", index)) {
      skipping = true;
      depth = 0;
    }
    if (skipping) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}") {
        depth -= 1;
        if (depth === 0) skipping = false;
      }
      continue;
    }
    screen += css[index];
  }
  return [...screen.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => [match[1]!.trim().replace(/\s+/g, " "), match[2]!] as const);
}

test("a rule that fixes a background and a text colour keeps them readable in both themes", () => {
  const failures: string[] = [];
  for (const file of readdirSync(STYLES).filter((name) => name.endsWith(".css") && name !== "tokens.css")) {
    for (const [selector, body] of screenRules(readFileSync(join(STYLES, file), "utf8"))) {
      if (/@keyframes|::placeholder|::selection/.test(selector)) continue;
      const fill = /(?:^|[\s;])background(?:-color)?\s*:\s*(#[0-9a-f]{3,6}|var\(--[\w-]+\))\s*(?:!important)?\s*;/i.exec(body)?.[1];
      const text = /(?:^|[\s;])color\s*:\s*(#[0-9a-f]{3,6}|var\(--[\w-]+\))\s*(?:!important)?\s*;/i.exec(body)?.[1];
      if (!fill || !text) continue;
      // Both from the palette: already checked above, in the pairs the tokens are meant for.
      if (fill.startsWith("var(") && text.startsWith("var(")) continue;
      for (const [theme, tokens] of Object.entries(themes)) {
        const ratio = contrast(resolve(tokens, fill), resolve(tokens, text));
        if (ratio < MIN_TEXT_CONTRAST) failures.push(`${file} ${selector} (${theme}): ${text} on ${fill} = ${ratio.toFixed(2)}:1`);
      }
    }
  }
  assert.deepEqual(failures, []);
});
