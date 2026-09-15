import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router';
import { render, screen, within } from '@/test/intl';
import { TabBar } from './tab-bar';

function renderAt(path: string) {
  return render(<TabBar />, {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
  });
}

describe('TabBar', () => {
  it('renders the four Vietnamese destinations', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual(['Trang chủ', 'Xếp hạng', 'Xu hướng', 'Tài khoản']);
  });

  it('marks the current destination for assistive tech', () => {
    renderAt('/trends');
    expect(screen.getByRole('link', { name: 'Xu hướng' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Trang chủ' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the camera bubble outside the nav, pointing at /track', () => {
    renderAt('/');
    const bubble = screen.getByRole('link', { name: 'Ghi nhận' });
    expect(bubble).toHaveAttribute('href', '/track');
    // The spec's "separated camera bubble": an action, not a fifth destination.
    expect(bubble.closest('nav')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).not.toContainElement(bubble);
  });

  it('puts the bubble at the trailing end of the same row as the capsule', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    const bubble = screen.getByRole('link', { name: 'Ghi nhận' });

    // Same flex row, centred together — not a bubble floating above the bar (iOS parity).
    const row = bubble.parentElement;
    expect(row).not.toBeNull();
    expect(row).toContainElement(nav);
    expect(row?.className).toContain('items-center');

    // Trailing: the nav comes first in DOM order, the bubble last.
    expect(Array.from(row!.children).indexOf(nav)).toBeLessThan(
      Array.from(row!.children).indexOf(bubble),
    );
    expect(nav.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The safe-area padding is on the row, once — the old per-element hack is gone.
    expect(row?.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(bubble.className).not.toContain('fixed');
    expect(bubble.className).toContain('size-14');
  });
});
