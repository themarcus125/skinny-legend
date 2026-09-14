import { PlaceholderScreen } from './placeholder';

/** Xếp hạng — the ranked rows (Task 9). */
export function Component() {
  return <PlaceholderScreen titleKey="leaderboard.title" bodyKey="leaderboard.empty" />;
}

Component.displayName = 'LeaderboardScreen';
