import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

// Flat config for the two TypeScript packages. Formatting is Prettier's job, so
// eslint-config-prettier switches off every stylistic rule and what is left are
// rules about correctness.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      'mobile/**',
      'web/vite.config.ts',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // The codebase deliberately marks a deliberately-unused binding with a
      // leading underscore (middleware signatures, destructured tuples).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // TypeORM entities and Nest DTOs use declaration merging and decorators
      // that read as empty interfaces or unsafe assignments; the compiler is
      // the authority on types here.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Entity classes declare properties that decorators initialize.
    files: ['backend/src/entities/**/*.ts'],
    rules: { '@typescript-eslint/no-unsafe-declaration-merging': 'off' },
  },
  {
    // The console is React; the hooks rules catch stale closures and effects
    // that re-run forever, which type-checking cannot see.
    files: ['web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Every page fetches its data on mount and puts the result in state,
      // which is exactly what this rule discourages. Moving that to a shared
      // data-fetching hook is worth doing, but it is a refactor of all twelve
      // pages rather than something to force through a lint rule, so it stays
      // off until then. rules-of-hooks and exhaustive-deps, which catch real
      // bugs, are both on and currently report nothing.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['**/*.spec.ts'],
    languageOptions: { globals: { jest: 'readonly' } },
    rules: {
      // Tests deliberately feed wrong shapes to assert the guard rejects them.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
