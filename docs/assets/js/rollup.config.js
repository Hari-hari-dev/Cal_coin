import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import polyfillNode from 'rollup-plugin-polyfill-node';

export default {
    input: 'index.js',
    output: {
        file: 'bundle.js',
        format: 'umd',         // UMD for global usage in browsers
        name: 'solanaWeb3',    // Global variable name changed from 'anchor' to 'solanaWeb3'
        exports: 'named',      // Use named exports to avoid default export wrappers
        globals: {
            buffer: 'buffer'
        }
    },
    plugins: [
        // Polyfill Node built-ins (like Buffer)
        polyfillNode(),
        commonjs(),
        resolve({
            browser: true,
            preferBuiltins: false // Forces use of polyfilled modules in browsers
        }),
        json()
    ]
};
