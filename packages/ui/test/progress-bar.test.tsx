import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../src/index';

describe('<ProgressBar>', () => {
  it('exposes the value on the progressbar role', () => {
    render(<ProgressBar value={3} max={10} label="3 trên 10 điểm" />);
    const bar = screen.getByRole('progressbar', { name: '3 trên 10 điểm' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
    expect(screen.getByTestId('progress-bar-fill').style.width).toBe('30%');
  });

  it('clamps a value above max', () => {
    render(<ProgressBar value={14} max={10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByTestId('progress-bar-fill').style.width).toBe('100%');
  });

  it('clamps a value below zero', () => {
    render(<ProgressBar value={-4} max={10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByTestId('progress-bar-fill').style.width).toBe('0%');
  });

  it('stays empty rather than dividing by a non-positive max', () => {
    render(<ProgressBar value={5} max={0} />);
    expect(screen.getByTestId('progress-bar-fill').style.width).toBe('0%');
  });
});
