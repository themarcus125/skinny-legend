import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['node_modules/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: { console: 'readonly', fetch: 'readonly', Response: 'readonly', Headers: 'readonly', URLSearchParams: 'readonly', globalThis: 'readonly', setTimeout: 'readonly' },
    },
    rules: {
      // js/recommended's no-unused-vars does not understand TypeScript syntax (type params,
      // overloads, `import type`), so the TS compiler owns unused-symbol reporting here.
      'no-unused-vars': 'off',
      'no-undef': 'off',
      /**
       * `@skinny/shared`'s package root star-exports `db/schema`, whose module top level calls
       * `pgTable`/`pgEnum` — importing it drags `drizzle-orm/pg-core` into every browser bundle
       * that consumes this client. Only the browser-safe subpaths are allowed here
       * (Task 1 report, "Notes for Task 2").
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
        },
      ],
    },
  },
];
