/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
  // the real-grid tests solve AC load flows on hundreds of buses; CI runners are slower than a desktop
  test: { testTimeout: 60_000 },
});
