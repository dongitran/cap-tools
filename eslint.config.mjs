import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// ─── Shared base rules (no type info required) ────────────────────────────────
const baseRules = {
  // General JS quality
  'eqeqeq': ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': 'error',
  'object-shorthand': ['error', 'always'],
  'prefer-template': 'error',
  'no-console': 'error',
  'no-param-reassign': ['error', { props: false }],
  'no-throw-literal': 'error',
  'radix': 'error',
  'curly': ['error', 'all'],

  // TypeScript recommended
  ...tseslint.configs.recommended.rules,

  // TypeScript correctness
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/no-inferrable-types': 'error',
  '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
  '@typescript-eslint/prefer-as-const': 'error',
};

// ─── Type-aware rules (requires parserOptions.project) ────────────────────────
const typeAwareRules = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }],
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/require-await': 'error',
  '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { boolean: true } }],
  '@typescript-eslint/prefer-optional-chain': 'error',
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  '@typescript-eslint/consistent-type-exports': ['error', { fixMixedExportsWithInlineTypeSpecifier: true }],
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: true }],
  '@typescript-eslint/strict-boolean-expressions': ['error', {
    allowString: true,
    allowNumber: false,
    allowNullableObject: true,
    allowNullableBoolean: false,
    allowNullableString: false,
    allowNullableNumber: false,
    allowAny: false,
  }],
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.mjs'],
  },

  // ─── Source files (full type-aware linting) ──────────────────────────────
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...baseRules,
      ...typeAwareRules,
    },
  },

  // ─── Test files (no project reference, relaxed) ──────────────────────────
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...baseRules,
      // Relax some rules for test files
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-param-reassign': 'off',
    },
  },
];
