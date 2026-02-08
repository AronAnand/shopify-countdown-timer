module.exports = {
    env: {
        node: true,
        es2021: true,
        jest: true,
        browser: true
    },
    extends: [
        'eslint:recommended'
    ],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true
        }
    },
    rules: {
        // Code style
        'indent': ['error', 4],
        'linebreak-style': ['error', 'unix'],
        'quotes': ['error', 'single', { 'avoidEscape': true }],
        'semi': ['error', 'always'],

        // Best practices
        'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
        'no-console': 'off',
        'eqeqeq': ['error', 'always'],
        'curly': ['error', 'all'],

        // Error prevention
        'no-undef': 'error',
        'no-unreachable': 'error',
        'no-duplicate-case': 'error',

        // ES6+
        'prefer-const': 'warn',
        'no-var': 'error',
        'arrow-spacing': 'error'
    },
    globals: {
        // Shopify globals
        'Shopify': 'readonly',
        // Widget globals
        'CountdownTimer': 'writable'
    },
    ignorePatterns: [
        'node_modules/',
        'coverage/',
        'dist/',
        '*.min.js',
        'public/'
    ]
};
