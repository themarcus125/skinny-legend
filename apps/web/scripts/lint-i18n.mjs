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

/**
 * Nothing under apps/web/src may hold a Vietnamese literal: every string a reader sees is a
 * catalog key. The mock's Vietnamese fixtures live in packages/api-client/src/mock/*.ts, which
 * this walker never reaches — it only descends apps/web/src.
 */
const ALLOWED = new Set([]);

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
