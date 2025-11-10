import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import testConfig from './eslint.test.config.js';

export default [
  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'out/**',
      '.vite/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '**/*.gen.ts',
      'routeTree.gen.ts',
      '*.config.js', // Includes eslint.test.config.js
      '*.config.ts',
      'forge.config.ts',
      'forge.env.d.ts',
      'scripts/**',
      'local.db*',
      'drizzle/**',
      '.storybook/**',
      'debug-formats.js',
    ],
  },

  // Base JavaScript recommended rules
  js.configs.recommended,

  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        // Node.js globals
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        exports: 'writable',
        global: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // Electron globals
        Electron: 'readonly',
        // TypeScript/Node globals
        NodeJS: 'readonly',
        React: 'readonly',
        // Electron Forge / Vite plugin globals (defined by forge)
        MAIN_WINDOW_VITE_DEV_SERVER_URL: 'readonly',
        MAIN_WINDOW_VITE_NAME: 'readonly',
        MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: 'readonly',
        BLOCKING_NOTIFICATION_WINDOW_VITE_DEV_SERVER_URL: 'readonly',
        BLOCKING_NOTIFICATION_WINDOW_VITE_NAME: 'readonly',
        CLOCK_WINDOW_VITE_DEV_SERVER_URL: 'readonly',
        CLOCK_WINDOW_VITE_NAME: 'readonly',
        NOTIFICATION_WINDOW_VITE_DEV_SERVER_URL: 'readonly',
        NOTIFICATION_WINDOW_VITE_NAME: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
      import: importPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
    },
    rules: {
      // TypeScript recommended rules
      ...tseslint.configs.recommended.rules,

      // TypeScript specific rules - adapted to your codebase
      '@typescript-eslint/no-explicit-any': 'off', // You use 'any' intentionally in many places
      '@typescript-eslint/no-unused-vars': 'off', // Replaced by unused-imports/no-unused-vars

      // Unused imports and exports detection
      'unused-imports/no-unused-imports': 'error', // Detect unused imports
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_|^e$|^err$|^error$',
        },
      ],
      // Import plugin rules
      'import/no-unresolved': 'off', // Let TypeScript handle this
      'import/extensions': [
        'error',
        'never',
        {
          json: 'always',
        },
      ],
      'import/no-unused-modules': [
        'error',
        {
          unusedExports: true,
          missingExports: false,
          src: ['src/**/*.ts', 'src/**/*.tsx'],
          ignoreExports: [
            'src/main.ts',
            'src/preload/**',
            'src/**/*.d.ts',
            'src/components/ui/**',
            'src/stories/**',
          ],
        },
      ],
      '@typescript-eslint/no-require-imports': 'off', // Allow require() for dynamic imports
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off', // Allow non-null assertions when you're certain
      '@typescript-eslint/ban-ts-comment': 'off',

      // React recommended rules
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,

      // React specific rules
      'react/prop-types': 'off', // TypeScript handles this
      'react/react-in-jsx-scope': 'off', // Not needed in React 17+
      'react/jsx-uses-react': 'off',
      'react/jsx-no-target-blank': 'off',
      'react/no-unescaped-entities': 'off', // Allow quotes in JSX text

      // React Hooks rules
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'off', // Turn off
      'react-hooks/rules-of-hooks': 'error', // Keep this as error

      // React Refresh rules
      'react-refresh/only-export-components': 'off', // Too strict for your architecture

      // General rules - adapted to your patterns
      'no-console': 'error', // Ban console - use logger instead
      'no-empty': 'off', // Allow empty catch blocks (common pattern)
      'no-useless-escape': 'off', // Turn off - regex escapes are fine
      'no-unreachable': 'off', // Turn off - might be intentional dead code for future use
      'no-redeclare': 'off', // Turn off - can be intentional for type/value
      'no-async-promise-executor': 'off', // Turn off
      'no-case-declarations': 'off', // Turn off
      'no-undef': 'error', // Keep as error - should be caught
      'prefer-const': 'off',
      'no-var': 'error',
      'object-shorthand': 'off', // Allow both styles
      eqeqeq: 'off',
      'no-debugger': 'off',
      '@typescript-eslint/triple-slash-reference': 'off', // Allow triple-slash for Electron Forge types

      // =====================================================
      // CODE COMPLEXITY & REFACTORING DETECTION RULES
      // =====================================================

      // Cyclomatic Complexity - measures number of independent paths through code
      // Higher values indicate code is harder to test and maintain
      // TIP: To find the function, look at the line number in the error
      complexity: ['warn', { max: 15 }], // Warn if function has >15 branches

      // Max lines per function - long functions are hard to understand
      'max-lines-per-function': [
        'warn',
        {
          max: 100, // Warn if function exceeds 100 lines
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true, // Ignore Immediately Invoked Function Expressions
        },
      ],

      // Max lines per file - large files should be split
      'max-lines': [
        'warn',
        {
          max: 500, // Warn if file exceeds 500 lines
          skipBlankLines: true,
          skipComments: true,
        },
      ],

      // Max nested callbacks - deeply nested code is hard to read
      'max-nested-callbacks': ['warn', { max: 4 }],

      // Max depth of blocks - deeply nested if/for/while statements
      'max-depth': ['warn', { max: 4 }],

      // Max parameters - functions with many params are hard to use
      'max-params': ['warn', { max: 5 }],

      // Max statements per line - multiple statements on one line is confusing
      'max-statements-per-line': ['error', { max: 1 }],

      // Nested ternary operators - hard to read and understand
      'no-nested-ternary': 'warn',

      // Code duplication detection
      'no-duplicate-case': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-else-if': 'error',

      // Cognitive complexity (TypeScript ESLint specific)
      // Measures how difficult code is to understand
      '@typescript-eslint/no-unnecessary-condition': 'off', // Can be noisy

      // Prefer early returns to reduce nesting
      'no-else-return': ['warn', { allowElseIf: false }],

      // Prefer destructuring to reduce repetitive property access
      'prefer-destructuring': [
        'warn',
        {
          array: false, // Don't enforce for arrays
          object: true, // Enforce for objects
        },
        {
          enforceForRenamedProperties: false,
        },
      ],

      // Arrow function body style - prefer implicit returns for simple functions
      'arrow-body-style': ['warn', 'as-needed'],

      // Consistent return - all return paths should return a value or none should
      'consistent-return': 'off', // TypeScript handles this better

      // Avoid unnecessary boolean comparisons
      'no-unneeded-ternary': 'warn',

      // Detect functions that always return the same value
      'no-constant-condition': 'warn',
    },
  },

  // Test files configuration
  testConfig,

  // Preload scripts - bridge between main and renderer
  {
    files: ['**/preload/**/*.ts', '**/preload.ts'],
    rules: {
      'no-console': 'error', // Console is useful for debugging preload
    },
  },

  // Main process files - Node.js environment
  {
    files: ['src/main/**/*.ts', 'src/main.ts', 'src/api/**/*.ts'],
    rules: {
      'no-console': 'error', // Server-side logging is fine
    },
  },

  // Renderer process files - Browser environment
  {
    files: ['src/renderer/**/*.tsx', 'src/components/**/*.tsx', 'src/pages/**/*.tsx'],
    rules: {
      // Renderer-specific rules can go here
    },
  },
];

