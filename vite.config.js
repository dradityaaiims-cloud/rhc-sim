import { defineConfig } from 'vite';

// Relative base so the build works from any GitHub Pages sub-path.
// es2022 for top-level await in main.js.
export default defineConfig({ base: './', build: { target: 'es2022' } });
