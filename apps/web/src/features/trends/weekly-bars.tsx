import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
 * grouped-bar layout, same rounded corners. `--primary` is iOS's `Theme.primary`; the group
 * average takes `--info` undiluted where iOS uses `Theme.info.opacity(0.45)`, because a 45 %
 * wash of it is invisible on the card. Measured against `--card`: `--primary` 15.5:1 light /
 * 13.2:1 dark, `--info` 6.2:1 light (#48607F) / 8.1:1 dark (#AABCD5) — both clear of 3:1 in
 * both themes, which `--chart-3` (Alice, 1.29:1 on the light card) was not.
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

  const mineLabel = t('trends.mineSeries');
  const groupLabel = t('trends.groupAverage');

  return (
    <div data-testid="weekly-bars" className="flex w-full flex-col">
      {/*
       * An SVG chart is a picture: the bars have geometry and no text. `role="img"` plus the
       * card's own heading and both series names is the summary, and the visually-hidden table
       * below is the fallback that carries the actual numbers — the reader's equivalent of
       * hovering every bar for its tooltip. iOS gets this for free from Swift Charts' audio
       * graph; the web has to build it.
       */}
      <div
        role="img"
        aria-label={`${t('trends.pointsByWeek')}: ${mineLabel}, ${groupLabel}`}
        className="h-[190px] w-full"
      >
      <ResponsiveContainer width="100%" height="100%">
        {/*
         * Recharts 3.10 defaults `accessibilityLayer` on, which makes the `<svg>` a
         * `role="application"` with `tabIndex=0` — a focusable stop inside a wrapper that is
         * already `role="img"`, i.e. a presentational subtree. The sr-only table below is the
         * reader's route to these numbers, so the layer is turned off rather than nested.
         */}
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          barGap={2}
          accessibilityLayer={false}
        >
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
            fill="var(--info)"
            isAnimationActive={false}
            shape={weekBarShape('week-bar-avg')}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
      {/*
       * Our own legend rather than Recharts': it renders in the bars' order (Recharts orders by
       * its internal registration, which came out reversed), the swatches are the same tokens
       * the bars are filled with, and it is plain DOM the hidden table can sit beside.
       */}
      <ul data-testid="weekly-bars-legend" aria-hidden="true" className="flex justify-center gap-4 pt-1">
        {[
          { label: mineLabel, color: 'var(--primary)' },
          { label: groupLabel, color: 'var(--info)' },
        ].map((series) => (
          <li key={series.label} className="type-caption text-foreground-secondary flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: series.color }}
            />
            {series.label}
          </li>
        ))}
      </ul>
      <table data-testid="weekly-bars-table" className="sr-only">
        <caption>{t('trends.pointsByWeek')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('common.week')}</th>
            <th scope="col">{mineLabel}</th>
            <th scope="col">{groupLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((week) => (
            <tr key={week.week}>
              <th scope="row">{week.label}</th>
              <td>{week.mine}</td>
              <td>{week.groupAvg}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
