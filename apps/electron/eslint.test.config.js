/**
 * ESLint configuration for test files
 * Provides Jest globals and relaxed rules for test code
 */
export default {
  files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**', '**/tests/**/*.ts'],
  languageOptions: {
    globals: {
      // Jest globals
      describe: 'readonly',
      it: 'readonly',
      test: 'readonly',
      expect: 'readonly',
      beforeEach: 'readonly',
      afterEach: 'readonly',
      beforeAll: 'readonly',
      afterAll: 'readonly',
      jest: 'readonly',
    },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-console': 'off',
    'no-undef': 'off',
  },
};

