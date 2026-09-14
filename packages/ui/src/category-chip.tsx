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
 * The per-category tints, derived from the semantic set rather than a palette of their own
 * (ios/SkinnyLegend/Core/Models/Category.swift: exercise → info, meal → success, group → primary).
 */
export const CATEGORY_CLASS: Record<ChipCategory, string> = {
  exercise: 'bg-info-soft text-info',
  meal: 'bg-success-soft text-success',
  group: 'bg-primary-soft text-primary',
};

const CATEGORY_GLYPH: Record<ChipCategory, typeof CircleGlyph> = {
  exercise: ActivityGlyph,
  meal: LeafGlyph,
  group: PeopleGlyph,
};

/**
 * One scoring category as the design system's badge/achievement chip. Port of `CategoryChip`
 * (ios/SkinnyLegend/Core/DesignSystem/CategoryChip.swift).
 *
 * **The hit area is 44px, the pill is not.** iOS engineers this explicitly: the visual is ~30pt
 * tall, because a taller pill would break the chip rows, so the label is wrapped in a
 * `.frame(minHeight: Theme.ControlHeight.md)` that `.contentShape(Rectangle())` makes tappable
 * edge to edge. The web does the same — the `<button>` is the 44px target (`min-h-11`, with
 * `--spacing: 4px`) and the pill is an inner element that keeps its own padding. An inert chip
 * has no target to size, so it *is* the pill.
 *
 * The locked label is `foreground-secondary`, not `foreground-subtle`: an un-selected chip's
 * label is read, not decoration (docs/design-system/tokens.md).
 */
export function CategoryChip({
  category,
  label,
  selected = true,
  capped = false,
  onToggle,
  className,
}: CategoryChipProps) {
  const Glyph = selected ? CATEGORY_GLYPH[category] : CircleGlyph;

  const identity = {
    'data-testid': 'category-chip',
    'data-slot': 'category-chip',
    'data-category': category,
    'data-selected': selected ? 'true' : 'false',
    'data-capped': capped ? 'true' : 'false',
  } as const;

  const pillClass = cn(
    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1.5 whitespace-nowrap',
    selected
      ? cn('border-transparent', CATEGORY_CLASS[category])
      : 'border-border bg-surface-2 text-foreground-secondary',
  );

  const body = (
    <>
      <Glyph size={12} className="shrink-0" />
      <span className="type-caption truncate">{label}</span>
      {capped ? <WarningGlyph size={10} className="shrink-0 text-warning" /> : null}
    </>
  );

  if (!onToggle) {
    return (
      <span {...identity} className={cn(pillClass, className)}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      {...identity}
      data-hit="44"
      className={cn('inline-flex min-h-11 max-w-full items-center', className)}
    >
      <span data-testid="category-chip-pill" className={pillClass}>
        {body}
      </span>
    </button>
  );
}
