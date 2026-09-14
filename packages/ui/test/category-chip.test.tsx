import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryChip } from '../src/index';

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
});
