import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';

export default {
    input: 'index.js',
    output: {
        file: 'bundle.js',
        format: 'umd', // Use UMD for global usage
        name: 'anchor' // Defines a global variable named `anchor`
    },
    plugins: [
        commonjs(),
        resolve({
          browser: true,
          preferBuiltins: false
        }),
        resolve({ browser: true }),
        json()
    ]
};
