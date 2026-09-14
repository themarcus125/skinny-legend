/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** `'1'` swaps the live client for `@skinny/api-client/mock`. Previews and e2e set it. */
  readonly VITE_MOCK?: string;
  readonly VITE_API_BASE_URL?: string;
  /** Dev only: sent as `x-test-uid` when the API runs with `AUTH_MODE=test` (ruling R17). */
  readonly VITE_TEST_UID?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
