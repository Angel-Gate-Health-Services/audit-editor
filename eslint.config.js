import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'tests/legacy-v4', 'public/theme-boot.js', 'tests/unit/legacy'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['src/**/*.{ts,tsx}', 'tests/unit/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-globals': ['error', { name: 'event', message: 'Use the handler argument.' }],
      'no-restricted-syntax': ['error',
        { selector: "MemberExpression[property.name='innerHTML']", message: 'Render with React instead of innerHTML.' },
        { selector: "MemberExpression[property.name='outerHTML']", message: 'Render with React instead of outerHTML.' },
        { selector: "CallExpression[callee.property.name='startViewTransition']", message: 'Motion is the only transition engine.' },
      ],
    },
  },
  {
    files: ['tests/unit/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
