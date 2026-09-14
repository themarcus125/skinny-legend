#!/usr/bin/env node
// Builds messages/en.json from messages/vi.json by looking each Vietnamese value up in the iOS
// String Catalog (its keys ARE the Vietnamese source strings). Web-only strings the catalog has
// never seen live in messages/web-only.json as vi+en pairs, keyed by the same dotted path.
// Vietnamese stays the source of truth: this script never invents an English value, and en.json
// is generated output — edit vi.json or web-only.json, never en.json.
//
// Ruling R14: `pnpm --filter @skinny/web test` runs this first, so a vi.json edit that has no
// translation fails the test run rather than shipping a half-translated catalog.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const XCSTRINGS = fileURLToPath(
  new URL('../../../ios/SkinnyLegend/Localizable.xcstrings', import.meta.url),
);

const vi = JSON.parse(readFileSync(`${ROOT}messages/vi.json`, 'utf8'));
const webOnly = JSON.parse(readFileSync(`${ROOT}messages/web-only.json`, 'utf8'));
const catalog = JSON.parse(readFileSync(XCSTRINGS, 'utf8')).strings;

/**
 * `%@` / `%lld` / `%1$@` → ICU `{0}`, `{1}`, … in source order, and `%%` → a literal `%`, so
 * use-intl can format the result. Ruling R13: it runs on the catalog KEY as well as the English
 * value, because vi.json is authored in ICU — that is what makes the two sides match.
 */
function toIcu(text) {
  let index = 0;
  return text.replace(/%%|%(\d+\$)?(?:@|lld|ld|d|f)/g, (match, position) => {
    if (match === '%%') return '%';
    return `{${position ? Number(position.slice(0, -1)) - 1 : index++}}`;
  });
}

/** Flattens { a: { b: 'x' } } to [['a.b', 'x']]. */
const flat = (node, prefix = '') =>
  typeof node === 'string'
    ? [[prefix, node]]
    : Object.entries(node).flatMap(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k));

/** ICU-normalised Vietnamese source string → ICU-normalised English translation. */
const fromIos = new Map();
for (const [key, entry] of Object.entries(catalog)) {
  const en = entry?.localizations?.en?.stringUnit?.value;
  if (typeof en === 'string' && en !== '') fromIos.set(toIcu(key), toIcu(en));
}

const rows = flat(vi);
const missing = [];
const stale = [];
const en = {};
let fromWebOnly = 0;

for (const [path, viValue] of rows) {
  const override = webOnly[path];
  let value;
  if (override) {
    // The pair is there so an edit to the Vietnamese cannot silently leave the English behind.
    if (override.vi !== viValue) {
      stale.push(`${path}\n    vi.json:       ${viValue}\n    web-only.json: ${override.vi}`);
      continue;
    }
    value = override.en;
    fromWebOnly += 1;
  } else {
    value = fromIos.get(viValue);
  }
  if (!value) {
    missing.push(`${path}: ${viValue}`);
    continue;
  }
  path
    .split('.')
    .reduce((node, key, i, keys) => (i === keys.length - 1 ? (node[key] = value) : (node[key] ??= {})), en);
}

const orphans = Object.keys(webOnly).filter((path) => !rows.some(([p]) => p === path));

if (stale.length > 0) {
  console.error(
    `seed-messages: ${stale.length} web-only entr(ies) no longer match vi.json:\n  ${stale.join('\n  ')}`,
  );
  process.exit(1);
}
if (orphans.length > 0) {
  console.error(
    `seed-messages: ${orphans.length} web-only key(s) with no vi.json counterpart:\n  ${orphans.join('\n  ')}`,
  );
  process.exit(1);
}
if (missing.length > 0) {
  console.error(
    `seed-messages: ${missing.length} key(s) with no translation.\n` +
      `Add them to messages/web-only.json as { "<path>": { "vi": …, "en": … } }:\n  ${missing.join('\n  ')}`,
  );
  process.exit(1);
}

writeFileSync(`${ROOT}messages/en.json`, `${JSON.stringify(en, null, 2)}\n`);
console.log(
  `seed-messages: wrote ${rows.length} keys to messages/en.json ` +
    `(${rows.length - fromWebOnly} from the iOS catalog, ${fromWebOnly} web-only).`,
);
