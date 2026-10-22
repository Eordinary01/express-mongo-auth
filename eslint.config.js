const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['**/node_modules/', '**/dist/', '**/coverage/'] },
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['client/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['client/vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
