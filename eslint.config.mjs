import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'out/**', 'dist/**', 'coverage/**', '**/.webpack/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {files:['scripts/spikes/*.cjs'],languageOptions:{globals:{require:'readonly',process:'readonly',Buffer:'readonly'}},rules:{'@typescript-eslint/no-require-imports':'off'}},
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly'
        ,Buffer:'readonly'
      }
    }
  },
  {
    files: ['**/*.ts','**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error'
    }
  }
);
