'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'vendor/**', 'whisper-runtime/**', 'docs/legacy/**']
  },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': [
        'error',
        { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', argsIgnorePattern: '^_' }
      ],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } }
  },
  {
    files: ['renderer/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } }
  },
  {
    files: ['renderer/js/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser } },
    // Shared values live on the imported `state` object; a local binding with
    // the same name would silently capture reads and writes meant for it.
    rules: { 'no-shadow': ['error', { builtinGlobals: false }] }
  },
  {
    files: ['renderer/*-processor.js'],
    languageOptions: {
      globals: {
        ...globals.audioWorklet,
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
        currentTime: 'readonly'
      }
    }
  }
];
