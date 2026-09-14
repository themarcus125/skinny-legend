/**
 * `@skinny/ui` — the Operation Skinny Legend design system for the web, shared by the admin
 * console (`apps/admin`) and the member PWA (`apps/web`).
 *
 * Two things live here:
 *
 * 1. **The token layer.** `styles/tokens.css` is the single source of the colour, elevation and
 *    chart tokens for both web clients (iOS transcribes the same table in `Theme.swift`);
 *    `styles/type.css` is the type-role class set; `styles/fonts.css` self-hosts Be Vietnam Pro
 *    400–800 with the `vietnamese` subset. Each app keeps its own Tailwind `@theme` bridge.
 * 2. **The components with no admin counterpart** — ported from the SwiftUI views in
 *    `ios/SkinnyLegend/Core/DesignSystem/` so the two clients render the same anatomy from the
 *    same tokens, plus the two web-only additions (`CategoryChip`, `LeaderboardRow`).
 *
 * The admin's shadcn/base-ui `Button`, `Badge` and `Card` stay in `apps/admin` (ruling R8): they
 * carry base-ui behaviour this package has no business owning.
 *
 * **This package holds no copy.** Every string a reader sees arrives as a prop, so both apps keep
 * their own catalogs (next-intl here, `Localized` on iOS) and neither ships a second one.
 * `eslint.config.mjs` blocks an i18n import.
 *
 * ## The geometry contract
 *
 * `styles/tokens.css` ships raw custom properties only. The components style themselves with
 * Tailwind *utilities*, and those utilities only carry the design system's geometry if the
 * consuming app's `@theme` bridge defines them. A host that skips the bridge still renders — it
 * renders with Tailwind's stock scale, which is the wrong shape, silently. What every consumer
 * must define (today: `apps/admin/src/app/globals.css`; Task 5 extracts these into
 * `@skinny/ui/styles/theme.css` so there is one copy):
 *
 * | Utility | Required value | Used by |
 * |---|---|---|
 * | `--spacing` | `4px` (so `min-h-11` is the 44px tap target, `size-2` an 8px dot) | `CategoryChip`, `StreakCounter` |
 * | `--radius-xl` (`rounded-xl`) | `18px` — the design system's `lg`, `Theme.cardCornerRadius` | `SurfaceCard`, `LeaderboardRow` |
 * | `--radius-md` (`rounded-md`) | `12px` | `AlertBanner` |
 * | `--text-xl` | `22px` / `26px` — the leaderboard rank numeral | `LeaderboardRow` |
 * | `--text-2xl` | `30px` / `34px` — the leaderboard total | `LeaderboardRow` |
 * | `--shadow-card` | `var(--shadow-1)` — elevation e1 | `SurfaceCard`, `LeaderboardRow` |
 * | `--color-card`, `--color-card-foreground`, `--color-surface-2`, `--color-track`, `--color-border` | the matching token | all |
 * | `--color-foreground`, `--color-foreground-secondary`, `--color-foreground-subtle` | the matching token | all |
 * | `--color-primary`, `--color-primary-foreground`, `--color-primary-soft`, `--color-primary-border` | the matching token | `Avatar`, `ProgressBar`, `StreakCounter`, `LeaderboardRow`, `CategoryChip` |
 * | `--color-success{,-soft}`, `--color-warning{,-soft}`, `--color-info{,-soft}`, `--color-destructive{,-soft}` | the matching token | `AlertBanner`, `CategoryChip` |
 *
 * Plus `styles/type.css` for `.type-caption` / `.type-h3` / `.type-label`, and — because Tailwind
 * v4 does not scan `node_modules` — a `@source "<relative path>/packages/ui/src";` in the app's
 * stylesheet, without which every class above is tree-shaken away and the markup ships unstyled.
 * `ProgressRing` sidesteps the bridge deliberately: an SVG `stroke` cannot take a Tailwind colour
 * utility, so it reads `var(--track)` / `var(--primary)` straight from `tokens.css`.
 */

export { cn } from './cn';

export { SurfaceCard, type SurfaceCardProps } from './surface-card';
export { AlertBanner, TONE_CLASS, type AlertBannerProps, type AlertTone } from './alert-banner';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { ProgressBar, progressFraction, type ProgressBarProps } from './progress-bar';
export { ProgressRing, type ProgressRingProps } from './progress-ring';
export { StreakCounter, filledDots, STREAK_CYCLE, type StreakCounterProps } from './streak-counter';
export { Avatar, AvatarStack, initials, type AvatarProps, type AvatarStackProps } from './avatar';
export { CategoryChip, CATEGORY_CLASS, type CategoryChipProps, type ChipCategory } from './category-chip';
export { LeaderboardRow, type LeaderboardRowProps } from './leaderboard-row';
