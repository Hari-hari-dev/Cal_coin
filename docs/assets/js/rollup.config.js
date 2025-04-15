import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
//import { terser } from "@rollup/plugin-terser";

//import polyfillNode from 'rollup-plugin-polyfill-node';

export default {
    input: 'index.js',
    output: {
        file: 'bundle.js',
        format: 'umd',         // UMD for global usage in browsers
        name: 'anchor',        // Global variable name (change if desired)
        exports: 'named',      // Use named exports to avoid default export wrappers
        // If Rollup treats "buffer" as an external module, you can map it here:
        globals: {
            buffer: 'buffer'
        }
    },
    plugins: [
        // Polyfill Node built-ins (like Buffer)
        //polyfillNode(),
        commonjs(),
        resolve({
            browser: true,
            preferBuiltins: false // Forces use of polyfilled modules in browsers
        }),
        json(),
        //terser()
    ]
};
