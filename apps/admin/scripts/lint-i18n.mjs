#!/usr/bin/env node
// Fails when Vietnamese copy is left inline in src/ instead of living in messages/*.json.
// Vietnamese is the source of truth, so vi.json is the ONLY place a Vietnamese string belongs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

const VIETNAMESE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;

/** Files whose Vietnamese text is fixture data or a developer-facing config error. */
const ALLOWED = new Set([
  'lib/api/mock.ts', // seeded entries, feedback and place names — fixtures, never shipped
  'lib/auth/firebase.ts', // "Thiếu biến môi trường NEXT_PUBLIC_FIREBASE_*" — a build-time crash
  'lib/auth/gate-decision.ts', // same: missing NEXT_PUBLIC_API_BASE_URL
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx)$/.test(path)) yield path;
  }
}

const offenders = [];
for (const path of walk(SRC)) {
  const rel = relative(SRC, path);
  if (rel.includes('.test.') || rel.startsWith('test/') || ALLOWED.has(rel)) continue;
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (code.trim().startsWith('*')) return;
      if (VIETNAMESE.test(code)) offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
    });
}

if (offenders.length > 0) {
  console.error(
    `lint-i18n: ${offenders.length} Vietnamese literal(s) outside messages/:\n${offenders.join('\n')}`,
  );
  process.exit(1);
}
console.log('lint-i18n: no stray Vietnamese literals in src/');
