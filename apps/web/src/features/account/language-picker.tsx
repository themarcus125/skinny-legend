import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import type { UserDto } from '@skinny/api-client';
import { useSession } from '@/auth/session';
import { deviceLanguage, type LocaleChoice } from '@/i18n/locale';
import { useLocaleChoice } from '@/i18n/provider';
import { useApi } from '@/lib/api';
import { reconcileLocale } from '@/lib/locale-reconcile';
import { ChoiceGroup, SettingRow } from './settings-row';

/**
 * "Ngôn ngữ" — Hệ thống / Tiếng Việt / English. Port of the `Picker` in
 * `ios/SkinnyLegend/Features/Account/AccountView.swift`.
 *
 * What is stored and what is sent follows spec §5 / ruling R18, and the two halves are deliberately
 * asymmetric:
 *
 * - An **explicit** `vi`/`en` is this browser's source of truth, so it is stored and — when the
 *   server disagrees — pushed. That decision is not re-implemented here: it is Task 6's
 *   `reconcileLocale` branch (1), the same function `SessionProvider` runs on every session load,
 *   so there is exactly one implementation of the rule in the app.
 * - **"Hệ thống"** stores `"system"` and sends nothing. "Follow this browser" is the weaker claim
 *   (`reconcileLocale` branch (2) has a stored `"system"` *adopt* the server's value rather than
 *   overwrite it): the console or another device may have set an explicit language deliberately,
 *   and a member who merely stopped pinning one here has not asked to change what the server uses
 *   for push and AI copy. The display still follows the device immediately, because that is a
 *   local concern — `LocaleProvider` resolves `"system"` against `navigator.language` on the spot.
 */
export function LanguagePicker() {
  const t = useTranslations();
  const api = useApi();
  const session = useSession();
  const { choice, setChoice } = useLocaleChoice();
  const user: UserDto | null =
    session.status === 'active' || session.status === 'pending' ? session.user : null;
  const { setUser } = session;

  const onChange = useCallback(
    (next: LocaleChoice) => {
      // Storage and the rendered catalog flip first: the language is this browser's preference,
      // and a failed `PATCH` must not undo what the member just picked.
      setChoice(next);
      if (next === 'system') return;
      const { push } = reconcileLocale({
        choice: next,
        deviceLanguage: deviceLanguage(),
        serverLocale: user?.locale ?? 'vi',
        userStatus: user?.status ?? 'active',
        // An explicit choice takes branch (1) whatever this is; `false` is the honest value, since
        // the key has certainly been written by the time anyone can click.
        isFreshInstall: false,
      });
      if (!push) return;
      void api
        .updateMe({ locale: push })
        .then(setUser)
        .catch((error: unknown) => {
          // Best-effort, exactly as in `SessionProvider.reconcile`: the next session load retries.
          console.error('[account] PATCH /me { locale } failed', error);
        });
    },
    [api, setChoice, setUser, user?.locale, user?.status],
  );

  return (
    <SettingRow
      label={t('account.language')}
      hint={t('account.languageHint')}
      divided={false}
      control={
        <ChoiceGroup
          testId="language-picker"
          label={t('account.language')}
          value={choice}
          onChange={onChange}
          options={[
            { value: 'system', label: t('account.system') },
            { value: 'vi', label: t('account.vietnamese') },
            { value: 'en', label: t('account.english') },
          ]}
        />
      }
    />
  );
}
