import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurfaceCard } from '../src/index';

describe('<SurfaceCard>', () => {
  it('renders its children in a plain div by default', () => {
    render(<SurfaceCard>Tuần này</SurfaceCard>);
    const card = screen.getByTestId('surface-card');
    expect(card.tagName).toBe('DIV');
    expect(card).toHaveTextContent('Tuần này');
    expect(card.dataset.accent).toBe('false');
  });

  it('flags the accent variant on data-accent', () => {
    render(<SurfaceCard accent>Mốc mới</SurfaceCard>);
    expect(screen.getByTestId('surface-card').dataset.accent).toBe('true');
  });

  it('changes the tag with `as`', () => {
    render(<SurfaceCard as="section">Xếp hạng</SurfaceCard>);
    expect(screen.getByTestId('surface-card').tagName).toBe('SECTION');
  });

  it('drops its own inset with padding="none", for a card whose rows own the edges', () => {
    const { rerender } = render(<SurfaceCard>Nội dung</SurfaceCard>);
    const card = () => screen.getByTestId('surface-card');
    expect(card().dataset.padding).toBe('default');
    expect(card().className).toContain('p-[18px]');

    rerender(<SurfaceCard padding="none">Nội dung</SurfaceCard>);
    expect(card().dataset.padding).toBe('none');
    expect(card().className).toContain('p-0');
    // `cn` joins rather than merges, so the inset must be gone, not merely overridden.
    expect(card().className).not.toContain('p-[18px]');
  });

  it('appends the caller className', () => {
    render(<SurfaceCard className="mt-6">Nội dung</SurfaceCard>);
    expect(screen.getByTestId('surface-card').className).toContain('mt-6');
  });
});
