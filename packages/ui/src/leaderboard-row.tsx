import { Avatar } from './avatar';
import { cn } from './cn';
import { ChevronRightGlyph } from './icons';

export interface LeaderboardRowProps {
  rank: number;
  name: string;
  avatarUrl?: string | null;
  /** The season total. */
  total: number;
  /** This week's points — `LeaderboardRowDto.weekPoints`. Rendered signed. */
  weekDelta: number;
  isMe?: boolean;
  /** e.g. "BẠN" — the pill shown only when `isMe`. */
  youLabel?: string;
  /** The unit word for the total, e.g. "điểm". */
  pointsLabel: string;
  onClick?: () => void;
  className?: string;
}

/**
 * The leaderboard's ranked row. Port of `LeaderboardRowView`
 * (ios/SkinnyLegend/Features/Leaderboard/LeaderboardView.swift): medal tint on the rank, avatar,
 * name with the "you" pill, this week's delta, the season total, and a disclosure chevron.
 *
 * With `onClick` the whole row is one button (iOS wraps it in a `NavigationLink`); without it the
 * row is inert markup, so a read-only list never announces a control that does nothing.
 */
export function LeaderboardRow({
  rank,
  name,
  avatarUrl,
  total,
  weekDelta,
  isMe = false,
  youLabel,
  pointsLabel,
  onClick,
  className,
}: LeaderboardRowProps) {
  // Medal tint: gold for first, muted for the podium, subtle for the rest.
  const rankTint =
    rank === 1 ? 'text-warning' : rank <= 3 ? 'text-foreground-secondary' : 'text-foreground-subtle';

  const shared = {
    'data-testid': 'leaderboard-row',
    'data-slot': 'leaderboard-row',
    'data-me': isMe ? 'true' : 'false',
    className: cn(
      'flex w-full items-center gap-3 rounded-xl border p-4 text-left shadow-card',
      isMe ? 'border-primary-border bg-primary-soft' : 'border-border bg-card',
      className,
    ),
  } as const;

  const body = (
    <>
      <span
        data-testid="leaderboard-rank"
        className={cn('w-[30px] shrink-0 text-center text-xl font-bold tabular-nums', rankTint)}
      >
        {rank}
      </span>
      <Avatar name={name} src={avatarUrl} size={44} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="type-h3 truncate font-heading text-foreground">{name}</span>
          {isMe && youLabel ? (
            <span className="type-label shrink-0 rounded-full bg-primary px-2 py-px text-primary-foreground">
              {youLabel}
            </span>
          ) : null}
        </span>
        <span
          data-testid="leaderboard-week-delta"
          className="type-caption text-foreground-secondary tabular-nums"
        >
          {weekDelta >= 0 ? `+${weekDelta}` : `${weekDelta}`}
        </span>
      </span>
      <span className="flex shrink-0 items-baseline gap-1">
        <span data-testid="leaderboard-total" className="text-2xl font-extrabold tabular-nums text-foreground">
          {total}
        </span>
        <span className="type-label text-foreground-secondary">{pointsLabel}</span>
      </span>
      {onClick ? <ChevronRightGlyph size={12} className="shrink-0 text-foreground-subtle" /> : null}
    </>
  );

  if (!onClick) return <div {...shared}>{body}</div>;

  return (
    <button type="button" onClick={onClick} {...shared}>
      {body}
    </button>
  );
}
