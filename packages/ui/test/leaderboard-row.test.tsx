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

  it('is inert markup when there is nowhere to navigate', () => {
    render(<LeaderboardRow rank={1} name="An" total={10} weekDelta={2} pointsLabel="điểm" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
