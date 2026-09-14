// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', '.astro/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Skrypty Node w paczce agenta review (`ai-review/`) — czysty JS, więc bez
    // wyłączenia `no-undef` przez typescript-eslint. Deklarujemy globale Node,
    // zamiast wyłączać reguły: paczka ma zostać lintowana, tylko z właściwym env.
    files: ['ai-review/**/*.mjs', 'ai-review/**/*.js'],
    languageOptions: { globals: globals.node },
  },
);
