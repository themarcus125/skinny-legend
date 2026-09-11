import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER_FORM, toEntryFilters, verdictSummary } from './filters';

describe('toEntryFilters', () => {
  it('drops the "all" sentinels and empty dates', () => {
    expect(toEntryFilters(EMPTY_FILTER_FORM)).toEqual({});
  });

  it('maps every set field to the API query shape', () => {
    expect(
      toEntryFilters({ user: 'u-2', status: 'pending', from: '2026-09-08', to: '2026-09-30' }),
    ).toEqual({ user: 'u-2', status: 'pending', from: '2026-09-08', to: '2026-09-30' });
  });

  it('keeps a date range without a user or status', () => {
    expect(toEntryFilters({ ...EMPTY_FILTER_FORM, from: '2026-09-08' })).toEqual({ from: '2026-09-08' });
  });
});

describe('verdictSummary', () => {
  it('reports a missing verdict', () => {
    expect(verdictSummary(null)).toBe('Không có');
  });

  it('reports a failed vision call', () => {
    expect(
      verdictSummary({ categories: [], healthy: null, confidence: null, reason: null, model: 'qwen/qwen3.7-flash', failed: true }),
    ).toBe('AI lỗi');
  });

  it('joins categories with the rounded confidence, translated to Vietnamese labels', () => {
    expect(
      verdictSummary({ categories: ['exercise', 'group'], healthy: null, confidence: 0.84, reason: 'x', model: 'm', failed: false }),
    ).toBe('Thể thao, Hoạt động nhóm · 84%');
  });

  it('appends the healthy verdict for a meal, translated to its Vietnamese label', () => {
    expect(
      verdictSummary({ categories: ['meal'], healthy: false, confidence: 0.42, reason: 'x', model: 'm', failed: false }),
    ).toBe('Bữa ăn lành mạnh · 42% · không lành mạnh');
  });

  it('falls back to the raw string for a category the model hallucinated outside the known set', () => {
    expect(
      verdictSummary({ categories: ['exercise', 'sleeping'], healthy: null, confidence: 0.5, reason: 'x', model: 'm', failed: false }),
    ).toBe('Thể thao, sleeping · 50%');
  });

  it('handles a verdict with no categories', () => {
    expect(
      verdictSummary({ categories: [], healthy: null, confidence: 0.3, reason: 'x', model: 'm', failed: false }),
    ).toBe('không có hạng mục · 30%');
  });
});
