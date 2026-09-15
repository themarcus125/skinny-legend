import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { AlertBanner, EmptyState, LeaderboardRow } from '@skinny/ui';
import { TrophyGlyph } from '@/app/icons';
import { LargeTitle } from '@/app/large-title';
import { PullToRefresh } from '@/app/pull-to-refresh';
import { useSession } from '@/auth/session';
import { describeError, useApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { Button } from '@/ui/button';

/**
 * Xếp hạng — the ranked board. Port of `LeaderboardView`
 * (ios/SkinnyLegend/Features/Leaderboard/LeaderboardView.swift): one row per member in
 * competition order (ties share a rank, and the next rank skips), the "you" pill on my own row,
 * this week's delta under the name, and the season total with a disclosure into the member.
 *
 * `isMe` comes off the row the server sent; the session's own id is the fallback, so the pill is
 * still right if a cached board outlives a sign-in.
 */
export function Leaderboard() {
  const t = useTranslations();
  const api = useApi();
  const navigate = useNavigate();
  const session = useSession();
  const myId = 'user' in session ? (session.user?.id ?? null) : null;

  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.leaderboard,
    queryFn: () => api.leaderboard(),
  });

  return (
    <>
      <PullToRefresh keys={[queryKeys.leaderboard]} />
      <LargeTitle title={t('leaderboard.title')} />
      <div className="flex flex-col gap-3 px-4 pt-2 pb-8">
        {isPending ? <LeaderboardSkeleton /> : null}
        {error ? (
          <AlertBanner
            tone="destructive"
            title={t('leaderboard.loadFailed')}
            description={t(describeError(error))}
            action={
              <Button size="sm" variant="secondary" onClick={() => void refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : null}
        {data?.length === 0 ? (
          <EmptyState
            icon={<TrophyGlyph className="size-8" />}
            title={t('leaderboard.empty')}
          />
        ) : null}
        {data?.map((row) => {
          const isMe = row.isMe || row.user.id === myId;
          const parts = {
            0: row.rank,
            1: row.user.displayName,
            2: row.total,
            3: row.weekPoints,
          };
          return (
            <LeaderboardRow
              key={row.user.id}
              rank={row.rank}
              name={row.user.displayName}
              avatarUrl={row.user.avatarUrl}
              total={row.total}
              weekDelta={row.weekPoints}
              weekLabel={t('leaderboard.weekLead')}
              isMe={isMe}
              youLabel={t('leaderboard.you')}
              pointsLabel={t('leaderboard.pointsUnit')}
              ariaLabel={
                isMe ? t('leaderboard.rowLabelYou', parts) : t('leaderboard.rowLabel', parts)
              }
              onClick={() => void navigate(`/leaderboard/${row.user.id}`)}
            />
          );
        })}
      </div>
    </>
  );
}

/** React Router 7's lazy-route convention. */
export const Component = Leaderboard;

/** Five rows in outline — the seeded group's size, so the list does not jump when it lands. */
function LeaderboardSkeleton() {
  return (
    <div data-testid="leaderboard-skeleton" aria-busy="true" className="flex flex-col gap-3">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="bg-surface-2 h-[76px] animate-pulse rounded-xl" />
      ))}
    </div>
  );
}
