// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'dist-e2e/', 'coverage/', 'playwright-report/', 'test-results/', '.cache/'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      // Untrusted data must never be parsed as HTML; DOM is built with textContent only.
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent / DOM builders (XSS safety).' },
        { property: 'outerHTML', message: 'Use textContent / DOM builders (XSS safety).' },
        { property: 'insertAdjacentHTML', message: 'Use DOM builders (XSS safety).' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**', '*.config.*', 'e2e/**'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
