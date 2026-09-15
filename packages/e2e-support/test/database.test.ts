import { describe, expect, it } from 'vitest';
import { databaseUrlFor, RESET_ORDER } from '../src/database.js';

describe('databaseUrlFor', () => {
  it('swaps the database name and keeps credentials and port', () => {
    expect(databaseUrlFor('postgres://skinny:skinny@localhost:5432/skinny', 'skinny_e2e')).toBe(
      'postgres://skinny:skinny@localhost:5432/skinny_e2e',
    );
  });

  it('keeps query parameters', () => {
    expect(databaseUrlFor('postgres://a:b@h:5432/x?sslmode=disable', 'skinny_e2e')).toBe(
      'postgres://a:b@h:5432/skinny_e2e?sslmode=disable',
    );
  });
});

describe('RESET_ORDER', () => {
  it('deletes children before parents and never touches challenges or scoring rules', () => {
    expect(RESET_ORDER).toEqual([
      'place_cache',
      'audit_log',
      'notification_log',
      'device_tokens',
      'feedback',
      'ai_verdicts',
      'entry_categories',
      'entries',
      'users',
    ]);
    expect(RESET_ORDER).not.toContain('challenges');
    expect(RESET_ORDER).not.toContain('scoring_rules');
  });
});
