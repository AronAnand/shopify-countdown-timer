/**
 * Rollup Configuration for Widget Bundle
 * Target: <30KB gzipped
 */

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
    input: 'extensions/theme-app-extension/assets/timer-widget.js',
    output: {
        file: 'extensions/theme-app-extension/assets/timer-widget.min.js',
        format: 'iife',
        name: 'CountdownTimer',
        sourcemap: false
    },
    plugins: [
        resolve({
            browser: true
        }),
        commonjs(),
        terser({
            compress: {
                drop_console: true,
                drop_debugger: true,
                pure_funcs: ['console.log', 'console.info', 'console.debug'],
                passes: 2
            },
            mangle: {
                toplevel: true,
                properties: {
                    regex: /^_/
                }
            },
            format: {
                comments: false
            }
        })
    ]
};
