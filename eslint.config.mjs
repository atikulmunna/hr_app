import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

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
    files: ['**/*.spec.ts'],
    languageOptions: { globals: { jest: 'readonly' } },
    rules: {
      // Tests deliberately feed wrong shapes to assert the guard rejects them.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
