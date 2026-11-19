// One ESLint config for the whole monorepo. Each package runs `eslint .` from its folder,
// and ESLint finds this file by walking up.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      '**/expo-env.d.ts',
      '.local-db/**',
      'supabase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    // Server secrets must never reach client code (Agent rule 17).
    files: ['apps/mobile/**/*.{ts,tsx}', 'apps/web/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@hx/db', message: 'Database access is server-only.' }],
          patterns: [{ group: ['@hx/db/*'], message: 'Database access is server-only.' }],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process.env',
          property: 'SUPABASE_SERVICE_ROLE_KEY',
          message: 'Server-only secret.',
        },
        { object: 'process.env', property: 'DATABASE_URL', message: 'Server-only secret.' },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
);
