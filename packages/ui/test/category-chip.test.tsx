import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CATEGORY_CLASS, CategoryChip, type ChipCategory } from '../src/index';

describe('<CategoryChip>', () => {
  it('mirrors `selected` on aria-pressed', async () => {
    const { rerender } = render(
      <CategoryChip category="exercise" label="Tập luyện" selected onToggle={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /Tập luyện/ })).toHaveAttribute('aria-pressed', 'true');
    rerender(
      <CategoryChip category="exercise" label="Tập luyện" selected={false} onToggle={() => {}} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('fires onToggle on click', async () => {
    const onToggle = vi.fn();
    render(<CategoryChip category="meal" label="Bữa ăn" onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: /Bữa ăn/ }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('keeps a capped chip clickable and flags it on data-capped', async () => {
    const onToggle = vi.fn();
    render(<CategoryChip category="group" label="Nhóm" capped onToggle={onToggle} />);
    const chip = screen.getByRole('button', { name: /Nhóm/ });
    expect(chip.dataset.capped).toBe('true');
    expect(chip).toBeEnabled();
    await userEvent.click(chip);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders as inert text when there is nothing to toggle', () => {
    render(<CategoryChip category="meal" label="Bữa ăn" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('category-chip')).toHaveTextContent('Bữa ăn');
  });

  it('carries the category on data-category', () => {
    render(<CategoryChip category="group" label="Nhóm" />);
    expect(screen.getByTestId('category-chip').dataset.category).toBe('group');
  });

  /**
   * The chip visual is ~30px, below the 44px minimum target. iOS solves this with
   * `.frame(minHeight: Theme.ControlHeight.md)` + `.contentShape(Rectangle())`; the web solves it
   * with `min-h-11` on the button (44px at `--spacing: 4px`) and the pill as an inner element, so
   * the rows stay tight while the target does not.
   */
  it('gives the interactive chip a 44px hit area around a compact pill', () => {
    render(<CategoryChip category="exercise" label="Tập luyện" onToggle={() => {}} />);
    const button = screen.getByRole('button');
    expect(button.dataset.hit).toBe('44');
    expect(button.className.split(' ')).toContain('min-h-11');
    // The pill is a separate, un-stretched element — the target grew, the visual did not.
    const pill = screen.getByTestId('category-chip-pill');
    expect(pill).not.toBe(button);
    expect(button).toContainElement(pill);
    expect(pill.className.split(' ')).not.toContain('min-h-11');
  });

  it('does not fake a hit area around an inert chip', () => {
    render(<CategoryChip category="exercise" label="Tập luyện" />);
    const chip = screen.getByTestId('category-chip');
    expect(chip.dataset.hit).toBeUndefined();
    expect(chip.className.split(' ')).not.toContain('min-h-11');
  });

  /** Guards the tint table: swapping two entries has to fail here, not in a screenshot. */
  it.each([
    ['exercise', 'bg-info-soft text-info'],
    ['meal', 'bg-success-soft text-success'],
    ['group', 'bg-primary-soft text-primary'],
  ] as Array<[ChipCategory, string]>)('tints a selected %s chip with %s', (category, expected) => {
    expect(CATEGORY_CLASS[category]).toBe(expected);
    render(<CategoryChip category={category} label="X" selected onToggle={() => {}} />);
    const classes = screen.getByTestId('category-chip-pill').className.split(' ');
    for (const cls of expected.split(' ')) expect(classes).toContain(cls);
  });

  it('drops the category tint for the locked variant', () => {
    render(<CategoryChip category="meal" label="Bữa ăn" selected={false} onToggle={() => {}} />);
    const classes = screen.getByTestId('category-chip-pill').className.split(' ');
    expect(classes).toContain('bg-surface-2');
    expect(classes).toContain('text-foreground-secondary');
    expect(classes).not.toContain('bg-success-soft');
  });
});
