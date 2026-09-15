import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * `@skinny/api-client`'s package root re-exports the mock client *and its fixtures*. A value
 * import of the root therefore risks dragging `makeSeed` into a production chunk, so the root is
 * banned outright: `src/lib/live-client.ts` holds the single allowed exception (with an inline
 * disable), and everything else takes `ApiClient`/`ApiError` as a **type** import, which
 * `verbatimModuleSyntax` erases before Rollup ever sees it.
 *
 * The mock itself is reached only through `@skinny/api-client/mock`, behind an inlined
 * `import.meta.env.VITE_MOCK === '1'` branch in `src/lib/api.tsx`.
 */
const restrictedImports = [
  'error',
  {
    paths: [
      {
        name: '@skinny/shared',
        message:
          'Import from @skinny/shared/wire, @skinny/shared/scoring or @skinny/shared/dates. The package root pulls drizzle into the browser bundle.',
        allowTypeImports: false,
      },
      {
        name: '@skinny/api-client',
        message:
          'The package root re-exports the mock seed. Take types with `import type`, get the live client from @/lib/live-client, and the mock only via @skinny/api-client/mock behind the VITE_MOCK branch.',
        allowTypeImports: true,
      },
    ],
    patterns: [
      {
        group: ['@skinny/api-client/src/mock/*', '@skinny/api-client/mock/*'],
        message: 'Import the mock from @skinny/api-client/mock.',
      },
    ],
  },
];

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'dev-dist/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  {
    // The build scripts are Node ESM, not browser code.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly', URLSearchParams: 'readonly' },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      ...tseslint.configs.recommended,
      // Type-aware rules, the cheap tier: the ones that need the checker to see a real bug
      // (floating promises, misused promises in JSX handlers, unnecessary awaits) without the
      // whole-program stylistic sweep of `strictTypeChecked`.
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        globalThis: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        process: 'readonly',
        HTMLElement: 'readonly',
        MediaQueryListEvent: 'readonly',
        Storage: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // js/recommended's no-unused-vars does not understand TypeScript syntax (type params,
      // `import type`, parameter properties), so the TS compiler owns unused-symbol reporting.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off',
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': restrictedImports,
    },
  },
  {
    // Tests exercise the mock and the error helpers directly; they are never bundled.
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**/*.ts', 'src/test/**'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
);
