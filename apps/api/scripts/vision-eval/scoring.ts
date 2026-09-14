/**
 * Pure scoring and aggregation for the SKI-41 vision model evaluation harness.
 *
 * Nothing in this file touches the network, the filesystem, the clock or `env` -
 * every input arrives as an argument so `test/vision-eval.test.ts` can exercise it
 * with a fake classifier. The CLI wiring lives in `run.ts`.
 */
import { CATEGORIES, type Category } from '@skinny/shared';

// --- Manifest -------------------------------------------------------------

export interface Expectation {
  categories: Category[];
  /** Only meaningful when `categories` contains 'meal'; null otherwise. */
  healthy: boolean | null;
}

export interface Fixture {
  file: string;
  expected: Expectation;
  note?: string;
}

export interface Manifest {
  fixtures: Fixture[];
}

/** Validates a parsed manifest.json and throws with a pointed message when a row is malformed. */
export function parseManifest(raw: unknown): Manifest {
  const rows = (raw as { fixtures?: unknown })?.fixtures;
  if (!Array.isArray(rows)) throw new Error('manifest.json: expected a top-level "fixtures" array');
  const fixtures = rows.map((row, i) => {
    const r = row as Partial<Fixture>;
    const where = `manifest.json fixtures[${i}]`;
    if (typeof r.file !== 'string' || r.file.length === 0) throw new Error(`${where}: "file" must be a non-empty string`);
    const cats = r.expected?.categories;
    if (!Array.isArray(cats)) throw new Error(`${where}: "expected.categories" must be an array`);
    for (const c of cats) {
      if (!(CATEGORIES as readonly string[]).includes(c)) {
        throw new Error(`${where}: unknown category ${JSON.stringify(c)} (allowed: ${CATEGORIES.join(', ')})`);
      }
    }
    const healthy = r.expected?.healthy ?? null;
    if (healthy !== null && typeof healthy !== 'boolean') throw new Error(`${where}: "expected.healthy" must be true, false or null`);
    if (healthy !== null && !cats.includes('meal')) throw new Error(`${where}: "expected.healthy" must be null when "meal" is not an expected category`);
    return { file: r.file, expected: { categories: [...new Set(cats)] as Category[], healthy }, note: r.note };
  });
  return { fixtures };
}

// --- Models ---------------------------------------------------------------

export interface ModelSpec {
  id: string;
  label?: string;
  status?: string;
  inputPerMTokensUsd?: number;
  outputPerMTokensUsd?: number;
}

export interface ModelsFile {
  models: ModelSpec[];
  pricing?: { assumedPromptTokens?: number; assumedCompletionTokens?: number };
}

export function parseModelsFile(raw: unknown): ModelsFile {
  const models = (raw as { models?: unknown })?.models;
  if (!Array.isArray(models) || models.length === 0) throw new Error('models.json: expected a non-empty "models" array');
  for (const [i, m] of models.entries()) {
    if (typeof (m as ModelSpec)?.id !== 'string') throw new Error(`models.json models[${i}]: "id" must be a string`);
  }
  return { models: models as ModelSpec[], pricing: (raw as ModelsFile).pricing };
}

// --- Usage and cost -------------------------------------------------------

export interface Usage {
  promptTokens: number | null;
  completionTokens: number | null;
  /** OpenRouter reports `usage.cost` in USD when usage accounting is on; null when absent. */
  costUsd: number | null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Pulls the OpenRouter `usage` block out of a chat-completions response body.
 * Returns null when the provider sent no usage accounting at all.
 */
export function extractUsage(body: unknown): Usage | null {
  const u = (body as { usage?: Record<string, unknown> } | null)?.usage;
  if (!u || typeof u !== 'object') return null;
  const promptTokens = num(u.prompt_tokens) ?? num(u.input_tokens);
  const completionTokens = num(u.completion_tokens) ?? num(u.output_tokens);
  const costUsd = num(u.cost) ?? num((u as { total_cost?: unknown }).total_cost);
  if (promptTokens === null && completionTokens === null && costUsd === null) return null;
  return { promptTokens, completionTokens, costUsd };
}

export interface Cost {
  usd: number | null;
  /** true when the number came from the models.json $/M table rather than OpenRouter. */
  estimate: boolean;
}

export function computeCost(
  usage: Usage | null,
  spec: ModelSpec,
  fallback: { assumedPromptTokens?: number; assumedCompletionTokens?: number } = {},
): Cost {
  // Best case: OpenRouter billed us and told us what it cost.
  if (usage && usage.costUsd !== null) return { usd: usage.costUsd, estimate: false };

  const inRate = spec.inputPerMTokensUsd;
  const outRate = spec.outputPerMTokensUsd;
  if (inRate === undefined || outRate === undefined) return { usd: null, estimate: true };

  const promptTokens = usage?.promptTokens ?? fallback.assumedPromptTokens ?? null;
  const completionTokens = usage?.completionTokens ?? fallback.assumedCompletionTokens ?? null;
  if (promptTokens === null || completionTokens === null) return { usd: null, estimate: true };

  return { usd: (promptTokens * inRate + completionTokens * outRate) / 1_000_000, estimate: true };
}

// --- Per-fixture outcome --------------------------------------------------

export interface Outcome {
  file: string;
  expected: Expectation;
  actual: { categories: Category[]; healthy: boolean | null };
  reason: string;
  confidence: number;
  failed: boolean;
  latencyMs: number;
  usage: Usage | null;
  cost: Cost;
}

/** Order-insensitive, duplicate-insensitive category comparison. */
export function categoriesMatch(a: readonly Category[], b: readonly Category[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((c) => sb.has(c));
}

// --- Aggregation ----------------------------------------------------------

export interface CategoryStats {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** null when the model never predicted this category (precision undefined). */
  precision: number | null;
  /** null when no fixture expects this category (recall undefined). */
  recall: number | null;
  f1: number | null;
}

export interface ModelReport {
  model: string;
  label?: string;
  status?: string;
  fixtures: number;
  /** Fraction of fixtures where the predicted category set equals the expected set. */
  exactMatchAccuracy: number;
  exactMatches: number;
  perCategory: Record<Category, CategoryStats>;
  /** Accuracy of the healthy flag over fixtures whose ground truth includes 'meal'; null when there are none. */
  healthyAccuracy: number | null;
  healthyFixtures: number;
  healthyCorrect: number;
  failureRate: number;
  failures: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  totalPromptTokens: number | null;
  totalCompletionTokens: number | null;
  totalCostUsd: number | null;
  /** true when any fixture's cost was estimated from the $/M table rather than reported by OpenRouter. */
  costIsEstimate: boolean;
  outcomes: Outcome[];
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

/**
 * Aggregates per-fixture outcomes into one model report.
 *
 * Failed verdicts (timeout, HTTP error, unparseable JSON) come back with an empty category
 * list, so they count as misses in the accuracy and recall numbers *and* in `failureRate`.
 * That is deliberate: from the app's point of view a timeout is a wrong answer.
 */
export function aggregate(model: string, outcomes: Outcome[], spec: ModelSpec = { id: model }): ModelReport {
  const perCategory = {} as Record<Category, CategoryStats>;
  for (const category of CATEGORIES) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const o of outcomes) {
      const expected = o.expected.categories.includes(category);
      const actual = o.actual.categories.includes(category);
      if (expected && actual) tp += 1;
      else if (!expected && actual) fp += 1;
      else if (expected && !actual) fn += 1;
    }
    const precision = tp + fp === 0 ? null : tp / (tp + fp);
    const recall = tp + fn === 0 ? null : tp / (tp + fn);
    const f1 = precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);
    perCategory[category] = { truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall, f1 };
  }

  const exactMatches = outcomes.filter((o) => categoriesMatch(o.expected.categories, o.actual.categories)).length;
  const mealOutcomes = outcomes.filter((o) => o.expected.categories.includes('meal'));
  const healthyCorrect = mealOutcomes.filter((o) => o.actual.healthy === o.expected.healthy).length;
  const failures = outcomes.filter((o) => o.failed).length;
  const latencies = outcomes.map((o) => o.latencyMs);

  const withUsage = outcomes.filter((o) => o.usage !== null);
  const sumTokens = (pick: (u: Usage) => number | null): number | null => {
    const vals = withUsage.map((o) => pick(o.usage!)).filter((v): v is number => v !== null);
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
  };
  const costs = outcomes.map((o) => o.cost.usd).filter((v): v is number => v !== null);

  return {
    model,
    label: spec.label,
    status: spec.status,
    fixtures: outcomes.length,
    exactMatchAccuracy: ratio(exactMatches, outcomes.length),
    exactMatches,
    perCategory,
    healthyAccuracy: mealOutcomes.length === 0 ? null : healthyCorrect / mealOutcomes.length,
    healthyFixtures: mealOutcomes.length,
    healthyCorrect,
    failureRate: ratio(failures, outcomes.length),
    failures,
    meanLatencyMs: outcomes.length === 0 ? 0 : Math.round(latencies.reduce((a, b) => a + b, 0) / outcomes.length),
    p95LatencyMs: Math.round(percentile(latencies, 95)),
    totalPromptTokens: sumTokens((u) => u.promptTokens),
    totalCompletionTokens: sumTokens((u) => u.completionTokens),
    totalCostUsd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0),
    costIsEstimate: outcomes.some((o) => o.cost.estimate),
    outcomes,
  };
}

// --- Rendering ------------------------------------------------------------

function pct(v: number | null): string {
  return v === null ? '-' : `${(v * 100).toFixed(0)}%`;
}

function money(report: ModelReport): string {
  if (report.totalCostUsd === null) return '-';
  const perPhoto = report.fixtures === 0 ? 0 : report.totalCostUsd / report.fixtures;
  return `$${perPhoto.toFixed(5)}${report.costIsEstimate ? '*' : ''}`;
}

/** Markdown summary table, one row per model. Pure - returns the string, prints nothing. */
export function renderSummaryTable(reports: ModelReport[]): string {
  const header = [
    '| Model | Fixtures | Exact match | Exercise P/R | Meal P/R | Group P/R | Healthy acc | Fail rate | Mean latency | p95 | $/photo |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  const rows = reports.map((r) => {
    const pr = (c: Category): string => `${pct(r.perCategory[c].precision)} / ${pct(r.perCategory[c].recall)}`;
    return `| \`${r.model}\` | ${r.fixtures} | ${pct(r.exactMatchAccuracy)} | ${pr('exercise')} | ${pr('meal')} | ${pr('group')} | ${pct(r.healthyAccuracy)} | ${pct(r.failureRate)} | ${r.meanLatencyMs} ms | ${r.p95LatencyMs} ms | ${money(r)} |`;
  });
  const footnote = reports.some((r) => r.costIsEstimate)
    ? '\n\n`*` cost estimated from the $/M table in `models.json` (OpenRouter returned no `usage` block); treat it as an order of magnitude, not a bill.'
    : '';
  return [...header, ...rows].join('\n') + footnote;
}

/** Per-model list of the fixtures the model got wrong - the part you actually read. */
export function renderMissTable(report: ModelReport): string {
  // A failed call is always listed, even when the empty result happens to match a fixture
  // whose ground truth is "no categories" - otherwise timeouts hide inside the accuracy number.
  const misses = report.outcomes.filter(
    (o) =>
      o.failed ||
      !categoriesMatch(o.expected.categories, o.actual.categories) ||
      (o.expected.categories.includes('meal') && o.actual.healthy !== o.expected.healthy),
  );
  if (misses.length === 0) return `### \`${report.model}\` misses\n\nNone.`;
  const rows = misses.map((o) => {
    const exp = `[${o.expected.categories.join(', ')}]${o.expected.categories.includes('meal') ? ` healthy=${o.expected.healthy}` : ''}`;
    const act = o.failed ? '**FAILED**' : `[${o.actual.categories.join(', ')}]${o.actual.categories.includes('meal') ? ` healthy=${o.actual.healthy}` : ''}`;
    const reason = o.reason.replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 90);
    return `| ${o.file} | ${exp} | ${act} | ${reason} |`;
  });
  return [`### \`${report.model}\` misses (${misses.length}/${report.fixtures})`, '', '| Fixture | Expected | Got | Model reason |', '|---|---|---|---|', ...rows].join('\n');
}

export interface ResultsDocument {
  timestamp: string;
  locale: string;
  concurrency: number;
  manifestFixtures: number;
  skipped: string[];
  reports: ModelReport[];
}

/** Builds the JSON written to results/<timestamp>.json. The timestamp is passed in, never read from the clock. */
export function buildResultsDocument(
  timestamp: string,
  meta: { locale: string; concurrency: number; manifestFixtures: number; skipped: string[] },
  reports: ModelReport[],
): ResultsDocument {
  return { timestamp, ...meta, reports };
}

// --- Execution (injected classifier, so it is testable without a network) ---

export type Classify = (fixture: Fixture) => Promise<Omit<Outcome, 'file' | 'expected'>>;

/** Runs `task` over `items` with at most `limit` in flight, preserving input order in the output. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const size = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await task(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Classifies every fixture with the injected classifier and aggregates the result. */
export async function evaluateModel(
  model: string,
  fixtures: readonly Fixture[],
  classify: Classify,
  options: { concurrency?: number; spec?: ModelSpec } = {},
): Promise<ModelReport> {
  const outcomes = await mapWithConcurrency(fixtures, options.concurrency ?? 2, async (fixture) => {
    const result = await classify(fixture);
    return { file: fixture.file, expected: fixture.expected, ...result } satisfies Outcome;
  });
  return aggregate(model, outcomes, options.spec ?? { id: model });
}
