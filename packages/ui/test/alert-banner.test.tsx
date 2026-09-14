import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBanner } from '../src/index';

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
});
