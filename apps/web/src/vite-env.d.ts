/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** `'1'` swaps the live client for `@skinny/api-client/mock`. Previews and e2e set it. */
  readonly VITE_MOCK?: string;
  readonly VITE_API_BASE_URL?: string;
  /** The build version shown in Account and sent with feedback; injected from package.json. */
  readonly VITE_APP_VERSION?: string;
  /** Dev only: sent as `x-test-uid` when the API runs with `AUTH_MODE=test` (ruling R17). */
  readonly VITE_TEST_UID?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  /**
   * Host:port of a Firebase Auth Emulator, e.g. `localhost:9099`. Set only by the end-to-end
   * suite's build; empty everywhere else, which is what keeps the email/password form out.
   */
  readonly VITE_FIREBASE_AUTH_EMULATOR_HOST?: string;
  /** Busts the persisted query cache when a new build ships; the Pages commit sha. */
  readonly VITE_BUILD_ID?: string;
  /** A custom domain in front of the R2 bucket, when the thumbnails are not on `*.r2.dev`. */
  readonly VITE_R2_PUBLIC_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
