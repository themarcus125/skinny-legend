import { describe, expect, it } from 'vitest';
import { isoWeekKey as sharedIsoWeekKey } from '@skinny/shared/dates';
import { translator } from '@/test/intl';
import type { Translate } from './axis-labels';
import {
  buildHeatGrid,
  heatLevel,
  heatmapCellLabel,
  isoWeekKey,
  weekAxisLabel,
  weekdayAxisLabel,
  weekdayIndex,
} from './axis-labels';

describe('the trends axis labels', () => {
  it('renders an ISO week as a short localised label', () => {
    expect(weekAxisLabel('2026-W38', 'vi')).toBe('T38');
    expect(weekAxisLabel('2026-W38', 'en')).toBe('W38');
    // The label is the week number alone, so a year rollover does not widen the axis.
    expect(weekAxisLabel('2027-W01', 'vi')).toBe('T01');
  });

  it('names the weekday columns from the catalog, Monday first', () => {
    const vi = translator('vi') as Translate;
    const en = translator('en') as Translate;
    expect([0, 1, 2, 3, 4, 5, 6].map((index) => weekdayAxisLabel(index, vi))).toEqual([
      'T2',
      'T3',
      'T4',
      'T5',
      'T6',
      'T7',
      'CN',
    ]);
    expect([0, 6].map((index) => weekdayAxisLabel(index, en))).toEqual(['Mon', 'Sun']);
  });

  it('buckets points onto five heat levels', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 12].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('names a heatmap cell by its day and points, or says nothing happened', () => {
    const vi = translator('vi') as Translate;
    expect(heatmapCellLabel('2026-09-14', 12, 'vi', vi)).toBe('Thứ Hai, 14/09: 12 điểm');
    expect(heatmapCellLabel('2026-09-14', 0, 'vi', vi)).toBe('Thứ Hai, 14/09: không hoạt động');
    const en = translator('en') as Translate;
    expect(heatmapCellLabel('2026-09-14', 12, 'en', en)).toBe('Monday, 14/09: 12 points');
    expect(heatmapCellLabel('2026-09-14', 0, 'en', en)).toBe('Monday, 14/09: no activity');
  });

  it('numbers ISO weeks exactly as the server does', () => {
    const days = ['2026-01-01', '2026-01-05', '2026-09-13', '2026-09-14', '2026-12-31', '2027-01-03'];
    expect(days.map(isoWeekKey)).toEqual(days.map(sharedIsoWeekKey));
    // Monday-first: 2026-09-13 is a Sunday, 2026-09-14 the Monday that opens week 38.
    expect(weekdayIndex('2026-09-13')).toBe(6);
    expect(weekdayIndex('2026-09-14')).toBe(0);
    expect(isoWeekKey('2026-09-14')).toBe('2026-W38');
  });

  it('groups reported days into calendar rows, oldest week first', () => {
    const grid = buildHeatGrid([
      { date: '2026-09-14', points: 6 },
      { date: '2026-09-11', points: 0 },
      { date: '2026-09-20', points: 3 },
    ]);
    expect(grid.map((row) => row.week)).toEqual(['2026-W37', '2026-W38']);
    expect(grid[0]?.cells).toEqual([{ date: '2026-09-11', points: 0, weekday: 4 }]);
    expect(grid[1]?.cells.map((cell) => cell.date)).toEqual(['2026-09-14', '2026-09-20']);
    // Every reported day gets exactly one cell — no filler.
    expect(grid.flatMap((row) => row.cells)).toHaveLength(3);
  });
});
