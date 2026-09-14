import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
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
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
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
      'no-undef': 'off',
      ...reactHooks.configs.recommended.rules,
      /**
       * `@skinny/shared`'s package root star-exports `db/schema`, whose module top level calls
       * `pgTable`/`pgEnum` — importing it drags `drizzle-orm/pg-core` into the browser bundle.
       * Only the browser-safe subpaths are allowed.
       *
       * `@skinny/api-client`'s root re-exports the mock client and its fixtures; the mock is
       * only ever reached through `@skinny/api-client/mock`, behind `IS_MOCK`, so a production
       * build never pulls the seed in (Task 2 review, deferred item).
       */
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@skinny/shared',
              message:
                'Import from @skinny/shared/wire, @skinny/shared/scoring or @skinny/shared/dates. The package root pulls drizzle into the browser bundle.',
            },
          ],
          patterns: [
            {
              group: ['@skinny/api-client/src/mock/*', '@skinny/api-client/mock/*'],
              message: 'Import the mock from @skinny/api-client/mock.',
            },
          ],
        },
      ],
    },
  },
];
