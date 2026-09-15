import { useTranslations } from 'use-intl';
import { useAppTheme } from '@/app/theme-provider';
import { ChoiceGroup, SettingRow } from './settings-row';

/**
 * "Giao diện" — Hệ thống / Sáng / Tối. Web-only: iOS follows the system appearance and offers no
 * override, but a browser tab is read next to the admin console and a desktop that may be set the
 * other way, so the PWA lets the member pin it.
 *
 * All the work lives in `useAppTheme` (src/app/theme-provider.tsx): it persists `skinny.theme`
 * and toggles `.dark` plus `color-scheme` on `<html>`, so the whole app — including the routes
 * outside the shell — re-renders on the new palette. `index.html` reads the same key before first
 * paint, which is what keeps the choice from flashing on reload.
 */
export function ThemePicker() {
  const t = useTranslations();
  const { choice, setChoice } = useAppTheme();

  return (
    <SettingRow
      label={t('account.theme')}
      hint={t('account.themeHint')}
      control={
        <ChoiceGroup
          testId="theme-picker"
          label={t('account.theme')}
          value={choice}
          onChange={setChoice}
          options={[
            { value: 'system', label: t('account.system') },
            { value: 'light', label: t('account.themeLight') },
            { value: 'dark', label: t('account.themeDark') },
          ]}
        />
      }
    />
  );
}
