// ============================================================
// ESLint — flat config
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// POR QUÉ ESTE ARCHIVO ES ASÍ
// ---------------------------
// El config anterior había quedado a mitad de camino entre los dos formatos y
// `npm run lint` no corría desde hacía meses: exportaba un array (flat config)
// pero adentro usaba `extends:`, que en flat config de ESLint 8 no existe, y
// encima hacía `...tseslint.configs.recommended`, que en la v6 del plugin es un
// objeto estilo eslintrc y no un array — "configs.recommended is not iterable".
//
// Acá los presets se aplican como lo que son en esta versión: conjuntos de
// reglas que se esparcen en `rules`. No hay `extends`.
//
// Sólo se lintea TypeScript (`src`): los `.cjs` del servidor son CommonJS de
// Node y necesitarían otro juego de globals y de reglas. Si algún día hay que
// lintearlos, van en un bloque propio con `globals.node`, no en éste.
// ============================================================

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  { ignores: ['dist', 'coverage', 'storybook-static', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: { ...globals.browser },
      parser: tsparser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // TypeScript ya resuelve los identificadores, y con globals de browser
      // marcaría falsos positivos sobre tipos y APIs del DOM.
      'no-undef': 'off',
      // La versión de TypeScript la controla el compilador, no ESLint.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
]
