import { defineConfig, globalIgnores } from 'eslint/config';
import nextPlugin from '@next/eslint-plugin-next';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'node_modules/**',
    'next-env.d.ts',
    'android/**/build/**',
    'electron/dist/**',
  ]),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        project: false,
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Type checking belongs to `next build` / `tsc`; keep ESLint focused on syntax/code quality.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
]);
