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
 */

export { cn } from './cn';

export { SurfaceCard, type SurfaceCardProps } from './surface-card';
export { AlertBanner, type AlertBannerProps, type AlertTone } from './alert-banner';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { ProgressBar, progressFraction, type ProgressBarProps } from './progress-bar';
export { ProgressRing, type ProgressRingProps } from './progress-ring';
export { StreakCounter, filledDots, STREAK_CYCLE, type StreakCounterProps } from './streak-counter';
export { Avatar, AvatarStack, initials, type AvatarProps, type AvatarStackProps } from './avatar';
export { CategoryChip, type CategoryChipProps, type ChipCategory } from './category-chip';
export { LeaderboardRow, type LeaderboardRowProps } from './leaderboard-row';
