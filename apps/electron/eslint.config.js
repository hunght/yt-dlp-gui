import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

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
      '*.config.js',
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
            'src/api/trpc.ts', // Context needed for router inference
            'src/hooks/use-toast.ts', // toast used in multiple files
            'src/api/routers/ytdlp/utils/**', // Utility functions
            'src/services/download-queue/**', // Queue service utilities
            'src/utils/**', // General utility functions
            'src/localization/**', // Localization files
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
      'no-console': 'off', // Allow console in Electron app
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
      'quote-props': 'off', // Allow flexibility
      eqeqeq: 'off',
      'no-debugger': 'off',
      '@typescript-eslint/triple-slash-reference': 'off', // Allow triple-slash for Electron Forge types
    },
  },

  // Test files configuration
  {
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
  },

  // Preload scripts - bridge between main and renderer
  {
    files: ['**/preload/**/*.ts', '**/preload.ts'],
    rules: {
      'no-console': 'off', // Console is useful for debugging preload
    },
  },

  // Main process files - Node.js environment
  {
    files: ['src/main/**/*.ts', 'src/main.ts', 'src/api/**/*.ts'],
    rules: {
      'no-console': 'off', // Server-side logging is fine
    },
  },

  // Renderer process files - Browser environment
  {
    files: ['src/renderer/**/*.tsx', 'src/components/**/*.tsx', 'src/pages/**/*.tsx'],
    rules: {
      // Renderer-specific rules can go here
    },
  },

  // Prettier config (must be last to override other configs)
  prettierConfig,
];

