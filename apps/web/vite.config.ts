import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev the dashboard reads the local API through this proxy; a static deploy
// points VITE_API_URL at a running API, or falls back to the recorded feed.
export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: { proxy: { '/v1': 'http://localhost:4021' } },
});
