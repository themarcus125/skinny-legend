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
  /**
   * The lead-in for the weekly delta, e.g. "Tuần này" — rendered immediately before the signed
   * number so the caller composes "Tuần này +5" without this package owning the word order's
   * copy. Omit for the bare delta.
   */
  weekLabel?: string;
  isMe?: boolean;
  /** e.g. "BẠN" — the pill shown only when `isMe`. */
  youLabel?: string;
  /** The unit word for the total, e.g. "điểm". */
  pointsLabel: string;
  /**
   * The whole-sentence accessible name for the row, e.g.
   * "Hạng 2, Ngô Hà Khoa, 48 điểm, tuần này 5 điểm". Port of
   * `LeaderboardRowView.accessibilityLabel(for:)` — iOS combines the row's children into one
   * element and names it from two whole-sentence catalog keys rather than a spliced fragment,
   * so each language reads as one sentence. Applied to the button; without `onClick` there is
   * no element that can carry a name, and the row's own text is what a reader gets.
   */
  ariaLabel?: string;
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
  weekLabel,
  isMe = false,
  youLabel,
  pointsLabel,
  ariaLabel,
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
          {weekLabel ? `${weekLabel} ` : ''}
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
    <button type="button" aria-label={ariaLabel} onClick={onClick} {...shared}>
      {body}
    </button>
  );
}
