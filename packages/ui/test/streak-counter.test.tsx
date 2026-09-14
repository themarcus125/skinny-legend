import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreakCounter, filledDots } from '../src/index';

describe('filledDots', () => {
  it('is empty for a dead streak', () => {
    expect(filledDots(0)).toBe(0);
    expect(filledDots(-3)).toBe(0);
  });
  it('lights one dot per day inside the cycle', () => {
    expect(filledDots(1)).toBe(1);
    expect(filledDots(6)).toBe(6);
  });
  it('shows a full row on the bonus day itself rather than an empty one', () => {
    expect(filledDots(7)).toBe(7);
    expect(filledDots(14)).toBe(7);
  });
  it('wraps past the bonus day', () => {
    expect(filledDots(8)).toBe(1);
    expect(filledDots(15)).toBe(1);
  });
  it('is empty for a non-positive cycle', () => {
    expect(filledDots(5, 0)).toBe(0);
  });
});

describe('<StreakCounter>', () => {
  it('renders seven dots with the lit ones marked and an accessible summary', () => {
    render(
      <StreakCounter
        days={3}
        longest={9}
        daysLabel="ngày liên tiếp"
        longestLabel="Dài nhất: 9 ngày"
        dotsLabel="3 trên 7 ngày của chuỗi hiện tại"
      />,
    );
    const dots = screen.getAllByTestId('streak-dot');
    expect(dots).toHaveLength(7);
    expect(dots.filter((d) => d.dataset.filled === 'true')).toHaveLength(3);
    expect(screen.getByLabelText('3 trên 7 ngày của chuỗi hiện tại')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('honours a custom cycle in the dot row', () => {
    render(
      <StreakCounter
        days={4}
        longest={4}
        cycle={5}
        daysLabel="ngày liên tiếp"
        longestLabel="Dài nhất: 4 ngày"
        dotsLabel="4 trên 5 ngày"
      />,
    );
    const dots = screen.getAllByTestId('streak-dot');
    expect(dots).toHaveLength(5);
    expect(dots.filter((d) => d.dataset.filled === 'true')).toHaveLength(4);
  });

  it('marks a dead streak so the number can read as inert', () => {
    render(
      <StreakCounter
        days={0}
        longest={12}
        daysLabel="ngày liên tiếp"
        longestLabel="Dài nhất: 12 ngày"
        dotsLabel="0 trên 7 ngày"
      />,
    );
    expect(screen.getByTestId('streak-counter').dataset.alive).toBe('false');
    expect(screen.queryAllByTestId('streak-dot').filter((d) => d.dataset.filled === 'true')).toHaveLength(0);
  });
});
