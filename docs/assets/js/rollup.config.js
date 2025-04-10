import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import nodePolyfills from 'rollup-plugin-node-polyfills';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

export default {
    input: 'anchor/main.js',
    output: {
        file: 'bundle.js',
        format: 'umd', // Use UMD for global usage
        name: 'anchor' // Defines a global variable named `anchor`
    },
    plugins: [
        commonjs(),
        nodePolyfills({ include: ['buffer'] }),
        resolve({ browser: true }),
        typescript({ target: "es2019" }),
        json()
    ]
};
