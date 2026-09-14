import { cn } from './cn';
import { ActivityGlyph, CircleGlyph, LeafGlyph, PeopleGlyph, WarningGlyph } from './icons';

/** The three scoring categories. Kept as a literal union so the package stays wire-type-free. */
export type ChipCategory = 'exercise' | 'meal' | 'group';

export interface CategoryChipProps {
  category: ChipCategory;
  /** The already-translated short label — this package holds no copy. */
  label: string;
  /** iOS's `isOn`: `false` is the *locked* variant, an outline on `surface-2`. Defaults to true. */
  selected?: boolean;
  /** The weekly cap has been hit; the chip stays usable and gains a warning mark. */
  capped?: boolean;
  /** Omit for an inert chip (a read-only tag), pass to make it a toggle button. */
  onToggle?: () => void;
  className?: string;
}

/**
 * One scoring category as the design system's badge/achievement chip. Port of `CategoryChip`
 * (ios/SkinnyLegend/Core/DesignSystem/CategoryChip.swift) — the tints are derived from the
 * semantic set (`info` / `success` / `primary`, per Core/Models/Category.swift) rather than a
 * palette of its own.
 *
 * The locked label is `foreground-secondary`, not `foreground-subtle`: an un-selected chip's label
 * is read, not decoration (docs/design-system/tokens.md).
 */
const CATEGORY_CLASS: Record<ChipCategory, string> = {
  exercise: 'bg-info-soft text-info',
  meal: 'bg-success-soft text-success',
  group: 'bg-primary-soft text-primary',
};

const CATEGORY_GLYPH: Record<ChipCategory, typeof CircleGlyph> = {
  exercise: ActivityGlyph,
  meal: LeafGlyph,
  group: PeopleGlyph,
};

export function CategoryChip({
  category,
  label,
  selected = true,
  capped = false,
  onToggle,
  className,
}: CategoryChipProps) {
  const Glyph = selected ? CATEGORY_GLYPH[category] : CircleGlyph;
  const shared = {
    'data-testid': 'category-chip',
    'data-slot': 'category-chip',
    'data-category': category,
    'data-selected': selected ? 'true' : 'false',
    'data-capped': capped ? 'true' : 'false',
    className: cn(
      'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1.5 whitespace-nowrap',
      selected
        ? cn('border-transparent', CATEGORY_CLASS[category])
        : 'border-border bg-surface-2 text-foreground-secondary',
      className,
    ),
  } as const;

  const body = (
    <>
      <Glyph size={12} className="shrink-0" />
      <span className="type-caption truncate">{label}</span>
      {capped ? <WarningGlyph size={10} className="shrink-0 text-warning" /> : null}
    </>
  );

  if (!onToggle) return <span {...shared}>{body}</span>;

  return (
    <button type="button" aria-pressed={selected} onClick={onToggle} {...shared}>
      {body}
    </button>
  );
}
