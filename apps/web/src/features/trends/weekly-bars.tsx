import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLocale, useTranslations } from 'use-intl';
import type { TrendsResponse } from '@skinny/shared/wire';
import type { Locale } from '@/i18n/locale';
import { weekAxisLabel } from './axis-labels';

/** One week's pair of bars: what I scored, and what the group averaged. */
interface WeekDatum {
  week: string;
  label: string;
  mine: number;
  groupAvg: number;
}

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: WeekDatum;
}

/**
 * Recharts draws a `<path>` by default, which carries nothing a test or a reader can hold on
 * to. A custom shape keeps the geometry Recharts computed and adds the hook plus the value —
 * `data-points` is what `trends.test.tsx` asserts the seeded bar heights through, since an SVG
 * path's `d` is not a number anybody should be parsing.
 *
 * `height` can come back negative for a zero-height bar; `Math.max` keeps the rect valid.
 */
function weekBarShape(testId: string) {
  return function WeekBarShape({ x = 0, y = 0, width = 0, height = 0, fill, payload }: BarShapeProps) {
    const points = testId === 'week-bar' ? payload?.mine : payload?.groupAvg;
    return (
      <rect
        data-testid={testId}
        data-week={payload?.week}
        data-points={points ?? 0}
        x={x}
        y={y}
        width={width}
        height={Math.max(0, height)}
        rx={6}
        fill={fill}
      />
    );
  };
}

/**
 * Điểm theo tuần — my weekly points against the group average, the port of `TrendsView`'s
 * `weeklyBars` (ios/SkinnyLegend/Features/Trends/TrendsView.swift). Same two series, same
 * grouped-bar layout, same rounded corners; `--primary` is iOS's `Theme.primary` and `--chart-3`
 * stands in for its `Theme.info.opacity(0.45)`, so both sides of the pair stay legible when the
 * tokens flip to dark.
 *
 * The X axis is formatted through `weekAxisLabel`, so the same catalog entry (`T%@` on iOS)
 * renders `T38` or `W38`. The Y axis is hidden: this is a phone-width PWA first, the bars are
 * read against each other rather than against a scale, and the tooltip carries the numbers.
 *
 * Default-exported for the `React.lazy` boundary in `trends.tsx` — this module is the only thing
 * that pulls Recharts in, and it stays out of the shell chunk.
 */
export function WeeklyBars({ weeks }: { weeks: TrendsResponse['weeks'] }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const data: WeekDatum[] = weeks.map((week) => ({
    week: week.week,
    label: weekAxisLabel(week.week, locale),
    mine: week.mine,
    // One decimal: an average of five members is rarely a whole number, and the raw float
    // makes the tooltip unreadable.
    groupAvg: Math.round(week.groupAvg * 10) / 10,
  }));

  return (
    <div data-testid="weekly-bars" className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barGap={2}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--foreground-secondary)', fontSize: 11, fontWeight: 600 }}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: 'var(--track)', opacity: 0.4 }}
            content={<WeekTooltip />}
          />
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="circle"
            iconSize={9}
            formatter={(value: string) =>
              // The legend is copy, so it reads from the catalog rather than the data key.
              (
                <span className="type-caption text-foreground-secondary">
                  {value === 'mine' ? t('trends.mineSeries') : t('trends.groupAverage')}
                </span>
              )
            }
          />
          {/*
           * No grow-in animation. It is 400 ms of motion on a chart the reader scrolled to
           * deliberately, it ignores `prefers-reduced-motion`, and its first frame is a
           * zero-height bar — which is also what a test would measure.
           */}
          <Bar
            dataKey="mine"
            fill="var(--primary)"
            isAnimationActive={false}
            shape={weekBarShape('week-bar')}
          />
          <Bar
            dataKey="groupAvg"
            fill="var(--chart-3)"
            isAnimationActive={false}
            shape={weekBarShape('week-bar-avg')}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The hovered week, in catalog copy: the week label then both series. */
function WeekTooltip({ active, payload }: { active?: boolean; payload?: { payload: WeekDatum }[] }) {
  const t = useTranslations();
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;
  return (
    <div
      data-testid="week-tooltip"
      className="border-border bg-card type-caption rounded-xl border px-3 py-2 shadow-card"
    >
      <p className="font-semibold">{datum.label}</p>
      <p>{`${t('trends.mineSeries')}: ${datum.mine}`}</p>
      <p className="text-foreground-secondary">{`${t('trends.groupAverage')}: ${datum.groupAvg}`}</p>
    </div>
  );
}

export default WeeklyBars;
