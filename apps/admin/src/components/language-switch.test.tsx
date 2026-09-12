import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/intl';
import { LanguageSwitch } from './language-switch';

const { updateMe, refresh } = vi.hoisted(() => ({ updateMe: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/auth/auth-context', () => ({ useAdminApi: () => ({ updateMe }) }));

beforeEach(() => {
  updateMe.mockReset().mockResolvedValue(undefined);
  refresh.mockReset();
  document.cookie = 'locale=vi; path=/';
});

async function pick(language: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Ngôn ngữ' }));
  await user.click(await screen.findByRole('option', { name: language }));
}

describe('LanguageSwitch', () => {
  it('shows the current language, labelled in Vietnamese', () => {
    render(<LanguageSwitch />);
    expect(screen.getByRole('combobox', { name: 'Ngôn ngữ' })).toHaveTextContent('Tiếng Việt');
  });

  it('writes the cookie, patches the server and refreshes on change', async () => {
    render(<LanguageSwitch />);
    await pick('English');

    expect(document.cookie).toContain('locale=en');
    expect(updateMe).toHaveBeenCalledWith({ locale: 'en' });
    expect(refresh).toHaveBeenCalled();
  });

  it('still switches the UI when the server rejects the patch', async () => {
    updateMe.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<LanguageSwitch />);
    await pick('English');

    expect(document.cookie).toContain('locale=en');
    expect(refresh).toHaveBeenCalled();
  });

  it('does nothing when the active language is picked again', async () => {
    render(<LanguageSwitch />);
    await pick('Tiếng Việt');

    expect(updateMe).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders under the English locale with an English label', () => {
    render(<LanguageSwitch />, { locale: 'en' });
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveTextContent('English');
  });
});
