import { describe, expect, it } from 'vitest';
import { formatDateTime, formatLocalDate, formatPercent, fromChallengeInput, toChallengeInput } from './format';

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

describe('challenge clock form values', () => {
  it('reads an instant as the challenge clock for a datetime-local field', () => {
    // 09:56 UTC is 16:56 in Ho Chi Minh City, whatever zone the admin's laptop is in.
    expect(toChallengeInput('2026-08-02T09:56:56.000Z')).toBe('2026-08-02T16:56');
    // Late evening UTC is already the next day there.
    expect(toChallengeInput('2026-09-28T17:30:00.000Z')).toBe('2026-09-29T00:30');
  });

  it('turns the field back into an instant on the challenge clock', () => {
    expect(fromChallengeInput('2026-09-09T17:00')).toBe('2026-09-09T17:00:00+07:00');
    expect(new Date(fromChallengeInput('2026-09-09T17:00')!).toISOString()).toBe('2026-09-09T10:00:00.000Z');
  });

  it('round-trips to the minute', () => {
    expect(toChallengeInput(fromChallengeInput('2026-09-26T07:05')!)).toBe('2026-09-26T07:05');
  });

  it('answers null for a field that is empty or half typed', () => {
    expect(fromChallengeInput('')).toBeNull();
    expect(fromChallengeInput('2026-09-09')).toBeNull();
  });
});
