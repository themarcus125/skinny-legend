import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/intl';
import { INSTALL_HINT_DISMISSED_KEY, InstallHint, shouldShowInstallHint } from './install-hint';

/** iOS Safari, out of standalone mode — what `needsHomeScreenInstall()` looks for. */
function pretendIosSafari() {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  );
}

describe('shouldShowInstallHint', () => {
  it.each([
    [{ isIosSafari: true, isStandalone: false, dismissed: false }, true],
    [{ isIosSafari: true, isStandalone: true, dismissed: false }, false],
    [{ isIosSafari: true, isStandalone: false, dismissed: true }, false],
    [{ isIosSafari: false, isStandalone: false, dismissed: false }, false],
  ])('decides visibility from the three inputs', (input, expected) => {
    expect(shouldShowInstallHint(input)).toBe(expected);
  });
});

describe('InstallHint', () => {
  it('renders nothing on a desktop browser', () => {
    render(<InstallHint />);

    expect(screen.queryByTestId('install-hint')).toBeNull();
  });

  it('explains the Home Screen install on iOS Safari', () => {
    pretendIosSafari();
    render(<InstallHint />);

    expect(screen.getByTestId('install-hint')).toHaveTextContent('Thêm vào màn hình chính');
    expect(screen.getByTestId('install-hint')).toHaveTextContent('Chia sẻ');
  });

  it('stays hidden once it has been dismissed before', () => {
    pretendIosSafari();
    localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, '1');
    render(<InstallHint />);

    expect(screen.queryByTestId('install-hint')).toBeNull();
  });

  it('remembers a dismissal', async () => {
    pretendIosSafari();
    render(<InstallHint />);

    await userEvent.click(screen.getByRole('button', { name: 'Đã hiểu' }));

    expect(screen.queryByTestId('install-hint')).toBeNull();
    expect(localStorage.getItem(INSTALL_HINT_DISMISSED_KEY)).toBe('1');
  });

  it('survives a localStorage that throws', () => {
    pretendIosSafari();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(() => render(<InstallHint />)).not.toThrow();
    expect(screen.getByTestId('install-hint')).toBeVisible();
  });
});
