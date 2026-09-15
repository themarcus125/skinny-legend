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
 * The rule for *what to store and what to send* is not re-implemented here: it is Task 6's
 * `reconcileLocale`, the same function `SessionProvider` runs on every session load, so there is
 * exactly one implementation of ruling R18 in the app. Picking a language here therefore behaves
 * like a session load that found that choice already stored.
 *
 * The one input that is not read from storage is `isFreshInstall`. A member who explicitly picks
 * "Hệ thống" is making the fresh install's claim on purpose — "follow this browser" — so the
 * choice is stored as `"system"` and the device-resolved language is pushed to the server, which
 * needs a concrete language for push and AI copy. Reading the real storage flag instead would
 * make branch (2) adopt the server's value and silently turn "Hệ thống" back into "Tiếng Việt".
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
      const { store, push } = reconcileLocale({
        choice: next,
        deviceLanguage: deviceLanguage(),
        serverLocale: user?.locale ?? 'vi',
        userStatus: user?.status ?? 'active',
        isFreshInstall: next === 'system',
      });
      // Storage and the rendered catalog flip first: the language is this browser's preference,
      // and a failed `PATCH` must not undo what the member just picked.
      setChoice(store);
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
