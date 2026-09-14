import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBanner, TONE_CLASS, type AlertTone } from '../src/index';

describe('<AlertBanner>', () => {
  it.each(['success', 'info'] as const)('announces %s politely with role="status"', (tone) => {
    render(<AlertBanner tone={tone} title="Đã lưu" />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Đã lưu');
    expect(banner.dataset.tone).toBe(tone);
  });

  it.each(['warning', 'destructive'] as const)('interrupts for %s with role="alert"', (tone) => {
    render(<AlertBanner tone={tone} title="Không tải được" />);
    expect(screen.getByRole('alert').dataset.tone).toBe(tone);
  });

  it('renders the description and the action', () => {
    render(
      <AlertBanner
        tone="destructive"
        title="Không tải được"
        description="Kiểm tra kết nối mạng."
        action={<button type="button">Thử lại</button>}
      />,
    );
    expect(screen.getByText('Kiểm tra kết nối mạng.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('omits the description element when there is no description', () => {
    render(<AlertBanner tone="info" title="Đang chờ duyệt" />);
    expect(screen.queryByTestId('alert-banner-description')).not.toBeInTheDocument();
  });

  /** Guards the tone table: swapping two entries has to fail here, not in a screenshot. */
  it.each([
    ['success', 'bg-success-soft text-success'],
    ['info', 'bg-info-soft text-info'],
    ['warning', 'bg-warning-soft text-warning'],
    ['destructive', 'bg-destructive-soft text-destructive'],
  ] as Array<[AlertTone, string]>)('paints a %s banner with %s', (tone, expected) => {
    expect(TONE_CLASS[tone]).toBe(expected);
    render(<AlertBanner tone={tone} title="X" />);
    const classes = screen.getByTestId('alert-banner').className.split(' ');
    for (const cls of expected.split(' ')) expect(classes).toContain(cls);
  });
});
