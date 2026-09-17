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

// ============================================================
// REGLA PROPIA: todo eslint-disable tiene que decir POR QUÉ
// ============================================================
// Silenciar una regla es a veces lo correcto —en las páginas de análisis,
// `exhaustive-deps` pedía un bug: incluir `filtros` hacía que limpiar los
// filtros volviera a imponer el mes en curso—. El problema no es el disable: es
// el disable MUDO, porque nadie puede distinguir una decisión de una rendición.
//
// Medido el 17/09/2026: había 94 disables, 65 sin explicación, y entre ellos 21
// casts a `any` que existían sólo porque nadie había leído los .d.ts de
// jspdf-autotable. Auditarlos costó medio día de lectura; los que tenían el
// motivo al lado se revisaron en dos minutos.
//
// Es un plugin inline —no una dependencia nueva— porque la regla es de este
// proyecto y no tiene sentido mantenerla aparte.
const reglasLocales = {
  rules: {
    'disable-con-motivo': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Un eslint-disable tiene que venir con un comentario que explique por qué.' },
        schema: [],
        messages: {
          sinMotivo:
            'Este eslint-disable no dice por qué. Escribí el motivo en un comentario arriba: ' +
            'sin eso, el que venga después no puede saber si es una decisión o una rendición.',
        },
      },
      create(context) {
        return {
          Program() {
            const código = context.sourceCode ?? context.getSourceCode()
            const comentarios = código.getAllComments()

            for (const [i, c] of comentarios.entries()) {
              if (!/^\s*eslint-disable/.test(c.value)) continue

              // Vale como motivo cualquier comentario propio inmediatamente
              // arriba (hasta 6 renglones, para bloques explicativos largos),
              // siempre que no sea otro disable.
              const tieneMotivo = comentarios.slice(0, i).some((prev) => {
                if (/^\s*eslint-disable/.test(prev.value)) return false
                const distancia = c.loc.start.line - prev.loc.end.line
                return distancia >= 0 && distancia <= 6
              })

              if (!tieneMotivo) context.report({ loc: c.loc, messageId: 'sinMotivo' })
            }
          },
        }
      },
    },
  },
}

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
      local: reglasLocales,
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

      // Ver el bloque de arriba. Es `warn` a propósito: la idea es que no se
      // acumulen disables mudos nuevos, no frenar un build por uno viejo.
      'local/disable-con-motivo': 'warn',
    },
  },
]
