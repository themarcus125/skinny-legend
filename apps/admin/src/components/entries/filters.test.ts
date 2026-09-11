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

  it('joins categories with the rounded confidence', () => {
    expect(
      verdictSummary({ categories: ['exercise', 'group'], healthy: null, confidence: 0.84, reason: 'x', model: 'm', failed: false }),
    ).toBe('exercise, group · 84%');
  });

  it('appends the healthy verdict for a meal', () => {
    expect(
      verdictSummary({ categories: ['meal'], healthy: false, confidence: 0.42, reason: 'x', model: 'm', failed: false }),
    ).toBe('meal · 42% · không lành mạnh');
  });

  it('handles a verdict with no categories', () => {
    expect(
      verdictSummary({ categories: [], healthy: null, confidence: 0.3, reason: 'x', model: 'm', failed: false }),
    ).toBe('không có hạng mục · 30%');
  });
});
