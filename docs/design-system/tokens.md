# Operation Skinny Legend — design tokens (v0.1)

Source of truth: [design-system.html](./design-system.html) (design's bundled page; serve it locally to browse — it is JS-rendered).
Decisions (2026-09-14): accent **Vanilla** is the default; both **light and dark** ship; iOS keeps native iOS 26 glass for system chrome only (tab bar, nav bar, sheets) and uses these flat surfaces for cards, buttons, chips; **Be Vietnam Pro** (OFL, full Vietnamese coverage — Urbanist was dropped on 2026-09-14 because it has no Vietnamese glyphs) is bundled at `ios/SkinnyLegend/Resources/Fonts/` (400–800) and loaded via `next/font/google` with the `vietnamese` subset in the admin.

## Principles (from the page)
- "Momentum, not measurement": progress is framed as personal bests, streaks and team camaraderie — never before/after or size.
- 44 pt minimum tap targets; native navigation; safe-area insets.
- Be Vietnam Pro for text (the design page specified Urbanist; see the decision note above), SF Mono for token/label monospace.

## Type scale
| Role | Size / line-height | Weight | Tracking |
|---|---|---|---|
| display | 44 / 1.0 | 800 | -3.5% |
| h1 | 30 / 1.12 | 700 | |
| h2 | 22 / 1.2 | 650 | |
| h3 | 17 / 1.3 | 600 | |
| body | 16 / 1.5 | 400 / 500 (medium) | |
| caption | 13 | 500 | |
| label | 11 | 600 | +6%, uppercase |

## Space / radius / elevation
- Space (4/8 grid): 1=4, 2=8, 3=12, 4=16, 6=24, 8=32, 12=48.
- Radius: sm 6, md 12, lg 18, full 999.
- Elevation: e1 card = `--sh1`, e2 sheet/popover = `--sh2`, e3 modal = `--sh3` (values below per theme).
- Buttons: sizes sm 32 / md 44 (iOS min) / lg 54; variants primary (ink CTA), secondary, ghost, destructive; states default/hover/active/disabled/loading.

## Light (`:root`, accent Vanilla)
| Token | Value |
|---|---|
| `--sans` | `"Be Vietnam Pro",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif` |
| `--mono` | `ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace` |
| `--g50` | `#F9F8FC` |
| `--g100` | `#F2F1F6` |
| `--g200` | `#E6E5EC` |
| `--g300` | `#D5D4DD` |
| `--g400` | `#ABABB5` |
| `--g500` | `#85858F` |
| `--g600` | `#6A6A74` |
| `--g700` | `#52525A` |
| `--g800` | `#3A3A40` |
| `--g900` | `#2B2B2F` |
| `--g950` | `#212121` |
| `--vanilla` | `#EFF0A3` |
| `--honeydew` | `#CFDECA` |
| `--alice` | `#D8DFE9` |
| `--eerie` | `#212121` |
| `--ghost` | `#F6F5FA` |
| `--bg` | `#EDECF1` |
| `--surface` | `#FBFAFD` |
| `--surface2` | `#F3F2F7` |
| `--elevated` | `#fff` |
| `--border` | `#E4E3EB` |
| `--border-strong` | `#CFCED9` |
| `--track` | `#E4E3EB` |
| `--fg` | `var(--eerie)` |
| `--fg-muted` | `#5C5C63` |
| `--fg-subtle` | `#85858F` |
| `--fg-onaccent` | `var(--ghost)` |
| `--primary` | `var(--eerie)` |
| `--primary-h` | `#333338` |
| `--primary-a` | `#0E0E0E` |
| `--primary-soft` | `var(--vanilla)` |
| `--primary-border` | `#E0E18C` |
| `--success` | `#4A6B4E` |
| `--success-soft` | `var(--honeydew)` |
| `--warning` | `#836417` |
| `--warning-soft` | `#F1E4B0` |
| `--destructive` | `#A63B34` |
| `--destructive-h` | `#8E2F29` |
| `--destructive-a` | `#77251F` |
| `--destructive-soft` | `#F1DAD8` |
| `--destructive-fg` | `#fff` |
| `--info` | `#48607F` |
| `--info-soft` | `var(--alice)` |
| `--sh1` | `0 1px 2px rgba(33,33,33,.06),0 1px 1px rgba(33,33,33,.04)` |
| `--sh2` | `0 4px 14px rgba(33,33,33,.08),0 1px 3px rgba(33,33,33,.05)` |
| `--sh3` | `0 18px 44px rgba(33,33,33,.14),0 3px 10px rgba(33,33,33,.06)` |

## Dark (`.dark`, accent Vanilla)
| Token | Value |
|---|---|
| `--bg` | `#171717` |
| `--surface` | `#232325` |
| `--surface2` | `#2B2B2E` |
| `--elevated` | `#2F2F32` |
| `--border` | `#3A3A3E` |
| `--border-strong` | `#4C4C52` |
| `--track` | `#3A3A3E` |
| `--fg` | `var(--ghost)` |
| `--fg-muted` | `#B4B4BB` |
| `--fg-subtle` | `#8A8A93` |
| `--fg-onaccent` | `var(--eerie)` |
| `--primary` | `var(--vanilla)` |
| `--primary-h` | `#F5F6BE` |
| `--primary-a` | `#DEDF90` |
| `--primary-soft` | `#3A3B24` |
| `--primary-border` | `#55562F` |
| `--success` | `#A9C6A4` |
| `--success-soft` | `#2C3A2B` |
| `--warning` | `#E0C57E` |
| `--warning-soft` | `#3A3122` |
| `--destructive` | `#E4A09A` |
| `--destructive-h` | `#EDB4AF` |
| `--destructive-a` | `#D28C86` |
| `--destructive-soft` | `#3C2725` |
| `--destructive-fg` | `var(--eerie)` |
| `--info` | `#AABCD5` |
| `--info-soft` | `#262E3A` |
| `--sh1` | `0 1px 2px rgba(0,0,0,.5)` |
| `--sh2` | `0 4px 14px rgba(0,0,0,.55),0 1px 3px rgba(0,0,0,.4)` |
| `--sh3` | `0 18px 44px rgba(0,0,0,.65),0 3px 10px rgba(0,0,0,.45)` |


## Deviations from the spec (accessibility)
**Both clients ship these values.** The admin dashboard (`apps/admin/src/app/globals.css`) and iOS
(`ios/SkinnyLegend/Core/DesignSystem/Theme.swift`) match this table token-for-token except for two
light-mode semantic inks. Badges, toasts and status pills render at 11–12px/600 on their own soft
fill, where the spec values land just under WCAG AA (4.5:1):

| Token | Spec | Shipped (admin + iOS) | On | Spec ratio | Shipped ratio |
|---|---|---|---|---|---|
| `--success` (light) | `#4A6B4E` | `#3F5D43` | `--success-soft` `#CFDECA` | 4.27:1 | 5.23:1 |
| `--warning` (light) | `#836417` | `#6F5412` | `--warning-soft` `#F1E4B0` | 4.33:1 | 5.58:1 |

Both stay in the same hue family, so a success pill still reads green and a warning pill still reads
amber. The dark counterparts already pass (6.47:1 and 7.59:1) and are unchanged.

Related rule, not a token change, and likewise enforced on both clients: `--fg-subtle` (`#85858F`,
`Theme.fgSubtle`) measures 3.51:1 on the card and 2.94:1 on the sidebar rail in light mode. It is
decoration only — dividers, empty-state marks, inert glyphs. Anything a reader has to read
(timestamps, sub-lines, card eyebrows, section headers, AI verdict reasons, an un-selected category
chip's label) uses `--foreground-secondary` / `Theme.fgMuted` (`#5C5C63`: 6.38:1 on the iOS card
surface, 5.96:1 on `surface2`, 5.64:1 on the app background, 5.58:1 on the accent milestone card,
and 6.38:1 on the admin card / 5.35:1 on the rail).

One documented iOS-only omission: the type scale's line-heights are not transcribed. SwiftUI has no
line-height control (`lineSpacing` adds to the font's leading rather than replacing it), so iOS
defers to Be Vietnam Pro's natural leading; the admin applies the table's values as CSS
`line-height`.

## Accent variants (not default)
Light honeydew: see html
Light alice: see html
Dark honeydew: {'--primary': 'var(--honeydew)', '--primary-h': '#DDE8D9', '--primary-a': '#B9CDB4', '--primary-soft': '#2C3A2B', '--primary-border': '#41533F'}
Dark alice: {'--primary': 'var(--alice)', '--primary-h': '#E5EAF1', '--primary-a': '#C1CBDB', '--primary-soft': '#262E3A', '--primary-border': '#3B465A'}

## Component showcase on the page (map to existing screens)
Buttons · progress ring (weekly goal) · bar progress · segmented sessions · streak counter with 7-day dots · badge/achievement chips (incl. locked) · leaderboard rows (rank, avatar initials, name, streak line, points; "YOU" pill) · text input/select/stepper/toggle/checkbox · cards + accent milestone card · tooltip/dialog/bottom sheet/toast · avatars + overflow "+6" · top nav large title → compact · segmented control · tab bar 49 pt + safe area · alerts (success/info/warning/destructive) · empty state.
