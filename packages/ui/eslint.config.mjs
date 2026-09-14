import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['node_modules/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: { console: 'readonly', document: 'readonly', window: 'readonly', globalThis: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // js/recommended's no-unused-vars does not understand TypeScript syntax (type params,
      // `import type`, parameter properties), so the TS compiler owns unused-symbol reporting.
      'no-unused-vars': 'off',
      'no-undef': 'off',
      ...reactHooks.configs.recommended.rules,
      /**
       * This package is copy-free by contract: every string a reader sees arrives as a prop, so
       * both apps keep their own next-intl / Localized catalogs and neither ships a second one.
       * Nothing here may pull in an i18n runtime.
       */
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'next-intl', message: '@skinny/ui takes all copy as props — no i18n dependency.' },
            { name: 'next', message: '@skinny/ui is framework-agnostic; it is consumed by Next and Vite alike.' },
          ],
        },
      ],
    },
  },
];
