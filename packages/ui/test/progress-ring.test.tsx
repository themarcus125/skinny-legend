import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressRing } from '../src/index';

/** The arc's dash pattern is `<filled> <remainder>`; the two sum to the circumference. */
function dashFraction(arc: Element): number {
  const [filled, rest] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number);
  return (filled ?? 0) / ((filled ?? 0) + (rest ?? 0));
}

describe('<ProgressRing>', () => {
  it('exposes the value on the progressbar role and renders its centre children', () => {
    render(
      <ProgressRing value={5} max={20} label="5 trên 20 điểm">
        <span>5</span>
      </ProgressRing>,
    );
    const ring = screen.getByRole('progressbar', { name: '5 trên 20 điểm' });
    expect(ring).toHaveAttribute('aria-valuenow', '5');
    expect(ring).toHaveAttribute('aria-valuemax', '20');
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(dashFraction(screen.getByTestId('progress-ring-arc'))).toBeCloseTo(0.25, 5);
  });

  it('clamps a value above max to a full arc', () => {
    render(<ProgressRing value={30} max={20} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    expect(dashFraction(screen.getByTestId('progress-ring-arc'))).toBeCloseTo(1, 5);
  });

  it('clamps a value below zero to an empty arc', () => {
    render(<ProgressRing value={-5} max={20} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(dashFraction(screen.getByTestId('progress-ring-arc'))).toBeCloseTo(0, 5);
  });

  it('honours the size and stroke width', () => {
    render(<ProgressRing value={1} max={2} size={96} strokeWidth={12} />);
    const svg = screen.getByTestId('progress-ring-svg');
    expect(svg).toHaveAttribute('width', '96');
    expect(screen.getByTestId('progress-ring-arc')).toHaveAttribute('stroke-width', '12');
  });
});
