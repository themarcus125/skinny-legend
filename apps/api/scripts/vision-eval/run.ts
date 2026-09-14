/**
 * SKI-41 vision model evaluation harness.
 *
 *   pnpm --filter @skinny/api vision:eval [--models a,b,c] [--locale vi|en] [--concurrency 2]
 *
 * Runs `classifyPhoto` from the real API service over the labelled fixture set in
 * ./fixtures, once per candidate model, and reports category accuracy, per-category
 * precision/recall, healthy-flag accuracy on meals, failure rate, latency and cost.
 *
 * This file is the only part of the harness that talks to the network or the disk; the
 * maths lives in ./scoring.ts and is unit-tested without either.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregate,
  buildResultsDocument,
  computeCost,
  extractUsage,
  mapWithConcurrency,
  parseManifest,
  parseModelsFile,
  renderMissTable,
  renderSummaryTable,
  type Fixture,
  type ModelReport,
  type ModelSpec,
  type Outcome,
  type Usage,
} from './scoring.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, 'fixtures');
const RESULTS_DIR = join(HERE, 'results');

// --- CLI ------------------------------------------------------------------

interface Options {
  models: string[] | null;
  locale: 'vi' | 'en';
  concurrency: number;
  timeoutMs: number;
  timestamp: string;
  dryRun: boolean;
}

function usage(): string {
  return [
    'Usage: pnpm --filter @skinny/api vision:eval [options]',
    '',
    '  --models a,b,c      Model ids to evaluate (default: every id in models.json)',
    '  --locale vi|en      Language of the model\'s `reason` sentence (default: vi)',
    '  --concurrency N     Fixtures in flight per model (default: 2)',
    '  --timeout-ms N      Per-request timeout (default: 20000; production uses 8000)',
    '  --timestamp S       Label for results/<timestamp>.json (default: now, ISO 8601)',
    '  --dry-run           List the fixtures and models that would run, call nothing',
    '  --help',
  ].join('\n');
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    models: null,
    locale: 'vi',
    concurrency: 2,
    timeoutMs: 20_000,
    timestamp: new Date().toISOString(),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const value = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return v;
    };
    switch (arg) {
      case '--models':
        opts.models = value().split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--locale': {
        const v = value();
        if (v !== 'vi' && v !== 'en') throw new Error(`--locale must be vi or en, got ${v}`);
        opts.locale = v;
        break;
      }
      case '--concurrency': {
        const n = Number(value());
        if (!Number.isFinite(n) || n < 1) throw new Error('--concurrency must be a positive integer');
        opts.concurrency = Math.floor(n);
        break;
      }
      case '--timeout-ms': {
        const n = Number(value());
        if (!Number.isFinite(n) || n < 1) throw new Error('--timeout-ms must be a positive integer');
        opts.timeoutMs = Math.floor(n);
        break;
      }
      case '--timestamp':
        opts.timestamp = value();
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(usage());
        process.exit(0);
        break;
      default:
        throw new Error(`unknown option ${arg}\n\n${usage()}`);
    }
  }
  return opts;
}

// --- OpenRouter usage capture --------------------------------------------

/**
 * Wraps global fetch so one `classifyPhoto` call also yields its `usage` block.
 *
 * `classifyPhoto` only hands back `choices[0].message.content` as `raw`, so the usage
 * accounting would otherwise be thrown away. The wrapper also opts the request into
 * OpenRouter's usage accounting (`usage: { include: true }`), which is what makes the
 * exact `usage.cost` available instead of a table estimate.
 */
function usageCapturingFetch(): { fetch: typeof fetch; read: () => Usage | null } {
  let captured: Usage | null = null;
  const wrapped = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let patched = init;
    try {
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        body.usage = { include: true };
        patched = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      patched = init;
    }
    const res = await globalThis.fetch(input, patched);
    if (!res.ok) return res;
    const text = await res.text();
    try {
      captured = extractUsage(JSON.parse(text));
    } catch {
      captured = null;
    }
    return new Response(text, { status: res.status, statusText: res.statusText, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: wrapped, read: () => captured };
}

// --- Main -----------------------------------------------------------------

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  // Load the repo-root .env (and any .env next to the cwd) before the key check, so
  // `OPENROUTER_API_KEY` works from either the shell or the file. dotenv never overrides
  // a variable that is already set, so the shell always wins.
  const { config } = await import('dotenv');
  config({ path: resolve(HERE, '../../../..', '.env'), quiet: true });
  config({ quiet: true });

  if (!opts.dryRun && !process.env.OPENROUTER_API_KEY) {
    console.error(
      [
        'OPENROUTER_API_KEY is not set.',
        '',
        'This harness makes real, paid calls to OpenRouter. Get a key at',
        'https://openrouter.ai/keys and run it as:',
        '',
        '  OPENROUTER_API_KEY=sk-or-... pnpm --filter @skinny/api vision:eval',
        '',
        'or put the key in the repo-root .env. Use --dry-run to check the fixture set',
        'and the model list without a key.',
      ].join('\n'),
    );
    return 1;
  }

  // `classifyPhoto` imports src/env.ts, which validates the whole server environment.
  // The harness needs exactly one variable (OPENROUTER_API_KEY, checked above), so fill in
  // placeholders for the database/auth vars it does not use. Anything already set wins.
  process.env.AUTH_MODE ??= 'test';
  process.env.DATABASE_URL ??= 'postgres://vision-eval:unused@localhost:5432/unused';
  const { classifyPhoto } = await import('../../src/services/vision.js');

  const manifest = parseManifest(JSON.parse(await readFile(join(FIXTURES_DIR, 'manifest.json'), 'utf8')));
  const modelsFile = parseModelsFile(JSON.parse(await readFile(join(HERE, 'models.json'), 'utf8')));

  const specs: ModelSpec[] = opts.models
    ? opts.models.map((id) => modelsFile.models.find((m) => m.id === id) ?? { id, status: 'not in models.json - no pricing available' })
    : modelsFile.models;

  const present: Fixture[] = [];
  const skipped: string[] = [];
  for (const fixture of manifest.fixtures) {
    if (await exists(join(FIXTURES_DIR, fixture.file))) present.push(fixture);
    else skipped.push(fixture.file);
  }
  for (const file of skipped) console.warn(`warn: fixture not found on disk, skipping: ${file}`);

  if (opts.dryRun) {
    console.log(`\nWould evaluate:\n${specs.map((s) => `  - ${s.id}${s.status ? `  (${s.status})` : ''}`).join('\n')}`);
    console.log(`\nFixtures on disk (${present.length}/${manifest.fixtures.length}):\n${present.map((f) => `  - ${f.file}`).join('\n') || '  (none)'}`);
    if (skipped.length > 0) console.log(`\nMissing from ${FIXTURES_DIR}:\n${skipped.map((f) => `  - ${f}`).join('\n')}`);
    return 0;
  }

  if (present.length === 0) {
    console.error(
      `No fixture photos found in ${FIXTURES_DIR}.\nAdd the JPEGs named in fixtures/manifest.json - see fixtures/README.md.`,
    );
    return 1;
  }
  console.error(`Running ${present.length}/${manifest.fixtures.length} fixtures against ${specs.length} model(s), locale=${opts.locale}, concurrency=${opts.concurrency}.`);

  const reports: ModelReport[] = [];
  for (const spec of specs) {
    console.error(`\n=> ${spec.id}${spec.status ? `  (${spec.status})` : ''}`);
    const outcomes = await mapWithConcurrency(present, opts.concurrency, async (fixture) => {
      const image = await readFile(join(FIXTURES_DIR, fixture.file));
      const capture = usageCapturingFetch();
      const verdict = await classifyPhoto(image, {
        fetch: capture.fetch,
        model: spec.id,
        locale: opts.locale,
        timeoutMs: opts.timeoutMs,
      });
      const usageBlock = capture.read();
      process.stderr.write(verdict.failed ? 'x' : '.');
      return {
        file: fixture.file,
        expected: fixture.expected,
        actual: { categories: verdict.categories, healthy: verdict.healthy },
        reason: verdict.reason,
        confidence: verdict.confidence,
        failed: verdict.failed,
        latencyMs: verdict.latencyMs,
        usage: usageBlock,
        cost: computeCost(usageBlock, spec, modelsFile.pricing ?? {}),
      } satisfies Outcome;
    });
    process.stderr.write('\n');
    reports.push(aggregate(spec.id, outcomes, spec));
  }

  const doc = buildResultsDocument(
    opts.timestamp,
    { locale: opts.locale, concurrency: opts.concurrency, manifestFixtures: manifest.fixtures.length, skipped },
    reports,
  );
  await mkdir(RESULTS_DIR, { recursive: true });
  const outPath = join(RESULTS_DIR, `${opts.timestamp.replace(/[:]/g, '-')}.json`);
  await writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  console.log(`\n## Vision model evaluation - ${opts.timestamp}\n`);
  console.log(renderSummaryTable(reports));
  for (const report of reports) console.log(`\n${renderMissTable(report)}`);
  console.log(`\nFull results: ${resolve(outPath)}`);
  if (skipped.length > 0) console.log(`Skipped ${skipped.length} fixture(s) with no photo on disk.`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  },
);
