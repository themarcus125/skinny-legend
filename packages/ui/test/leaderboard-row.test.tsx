import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeaderboardRow } from '../src/index';

describe('<LeaderboardRow>', () => {
  it('renders the rank, the name and the total', () => {
    render(<LeaderboardRow rank={2} name="Ngô Hà Khoa" total={48} weekDelta={5} pointsLabel="điểm" />);
    expect(screen.getByTestId('leaderboard-rank')).toHaveTextContent('2');
    expect(screen.getByText('Ngô Hà Khoa')).toBeInTheDocument();
    expect(screen.getByTestId('leaderboard-total')).toHaveTextContent('48');
    expect(screen.getByText('điểm')).toBeInTheDocument();
  });

  it('signs the weekly delta', () => {
    render(<LeaderboardRow rank={1} name="An" total={10} weekDelta={5} pointsLabel="điểm" />);
    expect(screen.getByTestId('leaderboard-week-delta')).toHaveTextContent('+5');
  });

  it('negates a losing week', () => {
    render(<LeaderboardRow rank={1} name="An" total={10} weekDelta={-2} pointsLabel="điểm" />);
    expect(screen.getByTestId('leaderboard-week-delta')).toHaveTextContent('-2');
  });

  it('composes the weekLabel with the signed delta', () => {
    render(
      <LeaderboardRow
        rank={1}
        name="An"
        total={10}
        weekDelta={5}
        weekLabel="Tuần này"
        pointsLabel="điểm"
      />,
    );
    expect(screen.getByTestId('leaderboard-week-delta')).toHaveTextContent('Tuần này +5');
  });

  it('names the row with the caller-composed sentence', async () => {
    render(
      <LeaderboardRow
        rank={2}
        name="Ngô Hà Khoa"
        total={48}
        weekDelta={5}
        pointsLabel="điểm"
        ariaLabel="Hạng 2, Ngô Hà Khoa, 48 điểm, tuần này 5 điểm"
        onClick={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Hạng 2, Ngô Hà Khoa, 48 điểm, tuần này 5 điểm' }),
    ).toBeInTheDocument();
  });

  it('falls back to the row text when no ariaLabel is given', () => {
    render(
      <LeaderboardRow rank={2} name="Ngô Hà Khoa" total={48} weekDelta={5} pointsLabel="điểm" onClick={() => {}} />,
    );
    const button = screen.getByRole('button');
    expect(button).not.toHaveAttribute('aria-label');
    expect(button).toHaveAccessibleName(/Ngô Hà Khoa/);
  });

  it('shows the you pill only when isMe', () => {
    const { rerender } = render(
      <LeaderboardRow rank={3} name="An" total={10} weekDelta={0} pointsLabel="điểm" youLabel="BẠN" isMe />,
    );
    expect(screen.getByText('BẠN')).toBeInTheDocument();
    expect(screen.getByTestId('leaderboard-row').dataset.me).toBe('true');
    rerender(
      <LeaderboardRow rank={3} name="An" total={10} weekDelta={0} pointsLabel="điểm" youLabel="BẠN" />,
    );
    expect(screen.queryByText('BẠN')).not.toBeInTheDocument();
    expect(screen.getByTestId('leaderboard-row').dataset.me).toBe('false');
  });

  it('is a button that calls onClick when the row is navigable', async () => {
    const onClick = vi.fn();
    render(
      <LeaderboardRow rank={1} name="An" total={10} weekDelta={2} pointsLabel="điểm" onClick={onClick} />,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('exposes the rank on data-rank, in both the button and the inert form', () => {
    const { rerender } = render(
      <LeaderboardRow rank={3} name="An" total={10} weekDelta={2} pointsLabel="điểm" />,
    );
    expect(screen.getByTestId('leaderboard-row').dataset.rank).toBe('3');
    rerender(
      <LeaderboardRow rank={3} name="An" total={10} weekDelta={2} pointsLabel="điểm" onClick={() => {}} />,
    );
    expect(screen.getByTestId('leaderboard-row').dataset.rank).toBe('3');
  });

  it('is inert markup when there is nowhere to navigate', () => {
    render(<LeaderboardRow rank={1} name="An" total={10} weekDelta={2} pointsLabel="điểm" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
