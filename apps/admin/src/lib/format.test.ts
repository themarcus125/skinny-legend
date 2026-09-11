import { describe, expect, it } from 'vitest';
import { formatDateTime, formatLocalDate, formatPercent } from './format';

describe('formatLocalDate', () => {
  it('reorders a challenge-local date without any timezone maths', () => {
    expect(formatLocalDate('2026-09-08')).toBe('08/09/2026');
  });

  it('returns unexpected input unchanged', () => {
    expect(formatLocalDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDateTime', () => {
  it('renders an instant in Asia/Ho_Chi_Minh', () => {
    const formatted = formatDateTime('2026-09-08T23:30:00.000Z');
    expect(formatted).toContain('09/09/2026');
    expect(formatted).toContain('06:30');
  });
});

describe('formatPercent', () => {
  it('rounds a 0-1 confidence to whole percent', () => {
    expect(formatPercent(0.824)).toBe('82%');
  });

  it('renders a dash when there is no confidence', () => {
    expect(formatPercent(null)).toBe('—');
  });
});
