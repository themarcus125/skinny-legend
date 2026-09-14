import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { classifyPhoto } from '../src/services/vision.js';
import {
  aggregate,
  buildResultsDocument,
  categoriesMatch,
  computeCost,
  evaluateModel,
  extractUsage,
  mapWithConcurrency,
  parseManifest,
  parseModelsFile,
  renderMissTable,
  renderSummaryTable,
  type Fixture,
  type Outcome,
} from '../scripts/vision-eval/scoring.js';

/**
 * Scoring/aggregation tests for the SKI-41 vision eval harness.
 *
 * Nothing here touches the network: the one test that exercises `classifyPhoto` injects a
 * fake fetch, and everything else feeds hand-built outcomes into the pure functions.
 */

const MANIFEST_PATH = fileURLToPath(new URL('../scripts/vision-eval/fixtures/manifest.json', import.meta.url));
const MODELS_PATH = fileURLToPath(new URL('../scripts/vision-eval/models.json', import.meta.url));

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function fixture(file: string, categories: Fixture['expected']['categories'], healthy: boolean | null = null): Fixture {
  return { file, expected: { categories, healthy } };
}

function outcome(f: Fixture, actual: Partial<Outcome['actual']>, extra: Partial<Outcome> = {}): Outcome {
  return {
    file: f.file,
    expected: f.expected,
    actual: { categories: actual.categories ?? [], healthy: actual.healthy ?? null },
    reason: '',
    confidence: 0.9,
    failed: false,
    latencyMs: 100,
    usage: null,
    cost: { usd: 0.001, estimate: true },
    ...extra,
  };
}

describe('manifest', () => {
  it('the committed manifest parses and covers the planned 20 fixtures', async () => {
    const manifest = parseManifest(JSON.parse(await readFile(MANIFEST_PATH, 'utf8')));
    expect(manifest.fixtures).toHaveLength(20);

    const files = manifest.fixtures.map((f) => f.file);
    expect(new Set(files).size).toBe(20);
    expect(files.every((f) => f.endsWith('.jpg'))).toBe(true);

    const meals = manifest.fixtures.filter((f) => f.expected.categories.includes('meal'));
    const groups = manifest.fixtures.filter((f) => f.expected.categories.includes('group'));
    const unrelated = manifest.fixtures.filter((f) => f.expected.categories.length === 0);
    expect(meals.length).toBeGreaterThanOrEqual(6);
    expect(groups).toHaveLength(4);
    expect(unrelated).toHaveLength(3);
    // Every meal fixture has to take a side on the healthy flag, and nothing else may.
    expect(meals.every((f) => typeof f.expected.healthy === 'boolean')).toBe(true);
    expect(manifest.fixtures.filter((f) => !f.expected.categories.includes('meal')).every((f) => f.expected.healthy === null)).toBe(true);
  });

  it('rejects unknown categories', () => {
    expect(() => parseManifest({ fixtures: [{ file: 'a.jpg', expected: { categories: ['sleep'], healthy: null } }] })).toThrow(/unknown category/);
  });

  it('rejects a healthy flag on a non-meal fixture', () => {
    expect(() => parseManifest({ fixtures: [{ file: 'a.jpg', expected: { categories: ['exercise'], healthy: true } }] })).toThrow(/must be null/);
  });

  it('rejects a manifest with no fixtures array', () => {
    expect(() => parseManifest({})).toThrow(/fixtures/);
  });
});

describe('models.json', () => {
  it('parses and lists the SKI-41 candidates with pricing', async () => {
    const models = parseModelsFile(JSON.parse(await readFile(MODELS_PATH, 'utf8')));
    expect(models.models.map((m) => m.id)).toEqual(['qwen/qwen3.7-flash', 'z-ai/glm-4.6v', 'z-ai/glm-5.3-flash', 'google/gemini-3.1-flash-lite']);
    expect(models.models.every((m) => typeof m.inputPerMTokensUsd === 'number' && typeof m.outputPerMTokensUsd === 'number')).toBe(true);
    // Every id carries the date it was last verified against the OpenRouter catalogue.
    expect(models.models.every((m) => /verified \d{4}-\d{2}-\d{2}/.test(m.status ?? ''))).toBe(true);
    expect(models.pricing?.assumedPromptTokens).toBeGreaterThan(0);
  });

  it('rejects an empty model list', () => {
    expect(() => parseModelsFile({ models: [] })).toThrow(/non-empty/);
  });
});

describe('categoriesMatch', () => {
  it('ignores order and duplicates', () => {
    expect(categoriesMatch(['exercise', 'group'], ['group', 'exercise'])).toBe(true);
    expect(categoriesMatch(['exercise'], ['exercise', 'exercise'])).toBe(true);
  });

  it('is false for a subset or a superset', () => {
    expect(categoriesMatch(['exercise', 'group'], ['exercise'])).toBe(false);
    expect(categoriesMatch([], ['exercise'])).toBe(false);
    expect(categoriesMatch(['meal'], [])).toBe(false);
  });
});

describe('extractUsage', () => {
  it('reads OpenRouter token counts and cost', () => {
    expect(extractUsage({ usage: { prompt_tokens: 1200, completion_tokens: 40, cost: 0.00023 } })).toEqual({
      promptTokens: 1200,
      completionTokens: 40,
      costUsd: 0.00023,
    });
  });

  it('accepts the input_tokens/output_tokens spelling and a missing cost', () => {
    expect(extractUsage({ usage: { input_tokens: 900, output_tokens: 30 } })).toEqual({ promptTokens: 900, completionTokens: 30, costUsd: null });
  });

  it('returns null when the provider sent no usage block', () => {
    expect(extractUsage({ choices: [] })).toBeNull();
    expect(extractUsage({ usage: {} })).toBeNull();
    expect(extractUsage(null)).toBeNull();
  });
});

describe('computeCost', () => {
  const spec = { id: 'm', inputPerMTokensUsd: 0.1, outputPerMTokensUsd: 0.4 };

  it('prefers the reported cost and does not flag it as an estimate', () => {
    expect(computeCost({ promptTokens: 1000, completionTokens: 50, costUsd: 0.00042 }, spec)).toEqual({ usd: 0.00042, estimate: false });
  });

  it('estimates from the $/M table when only token counts came back', () => {
    const cost = computeCost({ promptTokens: 1_000_000, completionTokens: 1_000_000, costUsd: null }, spec);
    expect(cost.estimate).toBe(true);
    expect(cost.usd).toBeCloseTo(0.5, 10);
  });

  it('falls back to assumed token counts when there is no usage block at all', () => {
    const cost = computeCost(null, spec, { assumedPromptTokens: 1500, assumedCompletionTokens: 80 });
    expect(cost.estimate).toBe(true);
    expect(cost.usd).toBeCloseTo((1500 * 0.1 + 80 * 0.4) / 1_000_000, 12);
  });

  it('reports an unknown cost rather than a wrong one when the model has no pricing', () => {
    expect(computeCost(null, { id: 'unpriced' }, { assumedPromptTokens: 1500, assumedCompletionTokens: 80 })).toEqual({ usd: null, estimate: true });
  });
});

describe('aggregate', () => {
  const gym = fixture('exercise-gym.jpg', ['exercise']);
  const salad = fixture('meal-salad.jpg', ['meal'], true);
  const boba = fixture('meal-bubble-tea.jpg', ['meal'], false);
  const duo = fixture('group-gym-two-people.jpg', ['exercise', 'group']);
  const selfie = fixture('unrelated-selfie.jpg', []);

  it('scores a perfect run', () => {
    const report = aggregate('m', [
      outcome(gym, { categories: ['exercise'] }),
      outcome(salad, { categories: ['meal'], healthy: true }),
      outcome(boba, { categories: ['meal'], healthy: false }),
      outcome(duo, { categories: ['group', 'exercise'] }),
      outcome(selfie, { categories: [] }),
    ]);
    expect(report.exactMatchAccuracy).toBe(1);
    expect(report.healthyAccuracy).toBe(1);
    expect(report.healthyFixtures).toBe(2);
    expect(report.failureRate).toBe(0);
    expect(report.perCategory.exercise).toMatchObject({ truePositives: 2, falsePositives: 0, falseNegatives: 0, precision: 1, recall: 1, f1: 1 });
  });

  it('counts an over-tagged negative as a false positive, not just a miss', () => {
    const report = aggregate('m', [
      outcome(gym, { categories: ['exercise'] }),
      outcome(selfie, { categories: ['exercise'] }), // the classic failure mode
    ]);
    expect(report.exactMatches).toBe(1);
    expect(report.exactMatchAccuracy).toBe(0.5);
    expect(report.perCategory.exercise).toMatchObject({ truePositives: 1, falsePositives: 1, falseNegatives: 0, precision: 0.5, recall: 1 });
    expect(report.perCategory.exercise.f1).toBeCloseTo(2 / 3, 10);
  });

  it('separates a partial category hit from an exact match', () => {
    const report = aggregate('m', [outcome(duo, { categories: ['exercise'] })]);
    expect(report.exactMatchAccuracy).toBe(0);
    expect(report.perCategory.exercise).toMatchObject({ truePositives: 1, falseNegatives: 0 });
    expect(report.perCategory.group).toMatchObject({ truePositives: 0, falseNegatives: 1, precision: null, recall: 0 });
  });

  it('scores the healthy flag only over fixtures whose ground truth is a meal', () => {
    const report = aggregate('m', [
      outcome(gym, { categories: ['exercise'], healthy: true }), // healthy noise outside a meal is ignored
      outcome(salad, { categories: ['meal'], healthy: false }), // wrong
      outcome(boba, { categories: ['meal'], healthy: false }), // right
    ]);
    expect(report.healthyFixtures).toBe(2);
    expect(report.healthyCorrect).toBe(1);
    expect(report.healthyAccuracy).toBe(0.5);
  });

  it('reports null healthy accuracy when no fixture is a meal', () => {
    expect(aggregate('m', [outcome(gym, { categories: ['exercise'] })]).healthyAccuracy).toBeNull();
  });

  it('counts a failed verdict in both the failure rate and the accuracy numbers', () => {
    const report = aggregate('m', [
      outcome(gym, { categories: [] }, { failed: true, latencyMs: 8000 }),
      outcome(salad, { categories: ['meal'], healthy: true }, { latencyMs: 1000 }),
    ]);
    expect(report.failures).toBe(1);
    expect(report.failureRate).toBe(0.5);
    expect(report.exactMatchAccuracy).toBe(0.5);
    expect(report.perCategory.exercise.recall).toBe(0);
    expect(report.meanLatencyMs).toBe(4500);
  });

  it('sums tokens and cost and flags the total as an estimate when any row was estimated', () => {
    const report = aggregate(
      'm',
      [
        outcome(gym, { categories: ['exercise'] }, { usage: { promptTokens: 1000, completionTokens: 20, costUsd: 0.0002 }, cost: { usd: 0.0002, estimate: false } }),
        outcome(salad, { categories: ['meal'], healthy: true }, { usage: null, cost: { usd: 0.0003, estimate: true } }),
      ],
      { id: 'm' },
    );
    expect(report.totalPromptTokens).toBe(1000);
    expect(report.totalCompletionTokens).toBe(20);
    expect(report.totalCostUsd).toBeCloseTo(0.0005, 10);
    expect(report.costIsEstimate).toBe(true);
  });

  it('leaves cost null when nothing could be priced', () => {
    const report = aggregate('m', [outcome(gym, { categories: ['exercise'] }, { cost: { usd: null, estimate: true } })]);
    expect(report.totalCostUsd).toBeNull();
  });

  it('handles an empty outcome list without dividing by zero', () => {
    const report = aggregate('m', []);
    expect(report.exactMatchAccuracy).toBe(0);
    expect(report.failureRate).toBe(0);
    expect(report.meanLatencyMs).toBe(0);
    expect(report.p95LatencyMs).toBe(0);
  });

  it('reports a p95 latency at or above the mean for a skewed run', () => {
    const outcomes = [100, 120, 130, 140, 5000].map((latencyMs, i) => outcome(fixture(`f${i}.jpg`, ['exercise']), { categories: ['exercise'] }, { latencyMs }));
    const report = aggregate('m', outcomes);
    expect(report.p95LatencyMs).toBe(5000);
    expect(report.meanLatencyMs).toBe(1098);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves input order and caps the number in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('treats a zero or negative limit as serial rather than hanging', async () => {
    expect(await mapWithConcurrency([1, 2], 0, async (n) => n)).toEqual([1, 2]);
  });

  it('returns an empty array for no items', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});

describe('evaluateModel with a fake fetch', () => {
  /** A fetch that never leaves the process: returns whatever verdict JSON the table says. */
  function fakeFetch(byFile: Record<string, string>, currentFile: () => string): typeof fetch {
    return (async () => {
      const content = byFile[currentFile()] ?? '{"categories":[],"healthy":null,"confidence":0.1,"reason":"khong ro"}';
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1200, completion_tokens: 40, cost: 0.0001 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
  }

  it('drives classifyPhoto over a fixture set and aggregates the result', async () => {
    const fixtures: Fixture[] = [
      fixture('exercise-gym.jpg', ['exercise']),
      fixture('meal-bubble-tea.jpg', ['meal'], false),
      fixture('unrelated-selfie.jpg', []),
    ];
    const replies: Record<string, string> = {
      'exercise-gym.jpg': '{"categories":["exercise"],"healthy":null,"confidence":0.9,"reason":"Phong gym."}',
      'meal-bubble-tea.jpg': '```json\n{"categories":["meal"],"healthy":false,"confidence":0.8,"reason":"Tra sua nhieu duong."}\n```',
      'unrelated-selfie.jpg': '{"categories":["exercise"],"healthy":null,"confidence":0.4,"reason":"Co nguoi trong anh."}',
    };

    let current = '';
    const report = await evaluateModel(
      'fake/model',
      fixtures,
      async (f) => {
        current = f.file;
        const verdict = await classifyPhoto(png, { fetch: fakeFetch(replies, () => current), model: 'fake/model' });
        const usage = { promptTokens: 1200, completionTokens: 40, costUsd: 0.0001 };
        return {
          actual: { categories: verdict.categories, healthy: verdict.healthy },
          reason: verdict.reason,
          confidence: verdict.confidence,
          failed: verdict.failed,
          latencyMs: verdict.latencyMs,
          usage,
          cost: computeCost(usage, { id: 'fake/model' }),
        };
      },
      { concurrency: 1 },
    );

    expect(report.fixtures).toBe(3);
    expect(report.exactMatches).toBe(2);
    expect(report.failures).toBe(0);
    expect(report.healthyAccuracy).toBe(1);
    // The selfie was over-tagged as exercise: precision suffers, recall does not.
    expect(report.perCategory.exercise).toMatchObject({ truePositives: 1, falsePositives: 1, recall: 1, precision: 0.5 });
    expect(report.costIsEstimate).toBe(false);
    expect(report.totalCostUsd).toBeCloseTo(0.0003, 10);
  });

  it('records a model that returns junk as a failure, not a crash', async () => {
    const fixtures = [fixture('exercise-gym.jpg', ['exercise'])];
    const report = await evaluateModel('fake/model', fixtures, async () => {
      const verdict = await classifyPhoto(png, { fetch: fakeFetch({}, () => 'nope'), model: 'fake/model' });
      return {
        actual: { categories: verdict.categories, healthy: verdict.healthy },
        reason: verdict.reason,
        confidence: verdict.confidence,
        failed: verdict.failed,
        latencyMs: verdict.latencyMs,
        usage: null,
        cost: computeCost(null, { id: 'fake/model' }),
      };
    });
    // The fallback reply is well-formed JSON with no categories: not a failure, just wrong.
    expect(report.failures).toBe(0);
    expect(report.exactMatches).toBe(0);
    expect(report.totalCostUsd).toBeNull();
  });
});

describe('rendering', () => {
  const report = aggregate('qwen/qwen3.7-flash', [
    outcome(fixture('exercise-gym.jpg', ['exercise']), { categories: ['exercise'] }),
    outcome(fixture('meal-salad.jpg', ['meal'], true), { categories: ['meal'], healthy: false }, { reason: 'Nhieu dau | mo' }),
    outcome(fixture('unrelated-selfie.jpg', []), { categories: [] }, { failed: true }),
    outcome(fixture('group-gym-two-people.jpg', ['exercise', 'group']), { categories: ['exercise'] }),
  ]);

  it('renders one markdown row per model with a header and a separator', () => {
    const table = renderSummaryTable([report]);
    const lines = table.split('\n');
    expect(lines[0]).toContain('| Model |');
    expect(lines[1]?.startsWith('|---')).toBe(true);
    expect(lines[2]).toContain('`qwen/qwen3.7-flash`');
    expect(lines[2]).toContain('75%'); // 3 of 4 category sets exactly right
    expect(lines[2]).toContain('25%'); // 1 of 4 calls failed
    expect(table).toContain('estimated from the $/M table');
  });

  it('renders an empty table body for no models', () => {
    expect(renderSummaryTable([]).split('\n')).toHaveLength(2);
  });

  it('lists healthy-flag misses and failed calls, not just wrong category sets', () => {
    const misses = renderMissTable(report);
    expect(misses).toContain('misses (3/4)');
    expect(misses).toContain('meal-salad.jpg'); // category set matched, healthy flag did not
    expect(misses).toContain('group-gym-two-people.jpg'); // dropped a category
    // The failed call matched its empty ground truth by accident; it is still listed.
    expect(misses).toContain('unrelated-selfie.jpg');
    expect(misses).toContain('**FAILED**');
    // A pipe in the model reason must not break the table.
    expect(misses).toContain('Nhieu dau \\| mo');
  });

  it('says so plainly when a model missed nothing', () => {
    const clean = aggregate('m', [outcome(fixture('exercise-gym.jpg', ['exercise']), { categories: ['exercise'] })]);
    expect(renderMissTable(clean)).toContain('None.');
  });
});

describe('buildResultsDocument', () => {
  it('uses the timestamp it is given rather than the clock', () => {
    const doc = buildResultsDocument('2026-09-14T03:00:00.000Z', { locale: 'vi', concurrency: 2, manifestFixtures: 20, skipped: ['unrelated-pet.jpg'] }, []);
    expect(doc).toEqual({
      timestamp: '2026-09-14T03:00:00.000Z',
      locale: 'vi',
      concurrency: 2,
      manifestFixtures: 20,
      skipped: ['unrelated-pet.jpg'],
      reports: [],
    });
    expect(JSON.parse(JSON.stringify(doc)).timestamp).toBe('2026-09-14T03:00:00.000Z');
  });
});
