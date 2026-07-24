// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Configuration ESLint (format « flat »).
 *
 * Volontairement mesurée : on veut attraper les vraies erreurs (variables
 * inutilisées, promesses non gérées) sans imposer un style tatillon que
 * Prettier gère déjà. Une règle qui crie pour rien finit ignorée.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/release/**',
      '**/coverage/**',
      '**/node_modules/**',
      // Extension et application de bureau : JavaScript natif, hors du périmètre
      // du contrôle TypeScript. Elles ont leurs propres contraintes (API
      // navigateur, API Electron) que ces règles ne connaissent pas.
      'apps/extension/**',
      'apps/desktop/**',
      // Scripts d'outillage Node (build, versioning) : hors du périmètre TS.
      'scripts/**',
      '**/*.mjs',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Les imports de type seuls doivent être marqués `import type`.
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    // Le code de test peut être plus permissif.
    files: ['tests/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
