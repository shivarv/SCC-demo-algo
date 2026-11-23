import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' = relative asset paths, so dist/ works at https://<user>.github.io/<any-repo-name>/
export default defineConfig({ base: './', plugins: [react()] });
