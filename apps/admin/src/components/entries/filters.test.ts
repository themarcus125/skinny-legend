import { describe, expect, it } from 'vitest';
import { translator } from '@/test/intl';
import { EMPTY_FILTER_FORM, toEntryFilters, verdictSummary } from './filters';

const t = translator('vi');

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
    expect(verdictSummary(null, t)).toBe('Không có');
  });

  it('reports a failed vision call', () => {
    expect(
      verdictSummary({ categories: [], healthy: null, confidence: null, reason: null, model: 'qwen/qwen3.7-flash', failed: true }, t),
    ).toBe('AI lỗi');
  });

  it('joins categories with the rounded confidence, translated to Vietnamese labels', () => {
    expect(
      verdictSummary({ categories: ['exercise', 'group'], healthy: null, confidence: 0.84, reason: 'x', model: 'm', failed: false }, t),
    ).toBe('Thể thao, Hoạt động nhóm · 84%');
  });

  it('appends the healthy verdict for a meal, translated to its Vietnamese label', () => {
    expect(
      verdictSummary({ categories: ['meal'], healthy: false, confidence: 0.42, reason: 'x', model: 'm', failed: false }, t),
    ).toBe('Bữa ăn lành mạnh · 42% · không lành mạnh');
  });

  it('falls back to the raw string for a category the model hallucinated outside the known set', () => {
    expect(
      verdictSummary({ categories: ['exercise', 'sleeping'], healthy: null, confidence: 0.5, reason: 'x', model: 'm', failed: false }, t),
    ).toBe('Thể thao, sleeping · 50%');
  });

  it('follows the translator it is given', () => {
    expect(
      verdictSummary({ categories: ['meal'], healthy: true, confidence: 0.9, reason: 'x', model: 'm', failed: false }, translator('en')),
    ).toBe('Healthy meal · 90% · healthy');
  });

  it('handles a verdict with no categories', () => {
    expect(
      verdictSummary({ categories: [], healthy: null, confidence: 0.3, reason: 'x', model: 'm', failed: false }, t),
    ).toBe('không có hạng mục · 30%');
  });
});
