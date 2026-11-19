import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()], optimizeDeps: { entries: ['index.html'] }, server: { watch: { ignored: ['**/node_modules.offloaded/**', '**/*.offloaded'] }, proxy: { '/api': 'http://127.0.0.1:3001' } } });
