/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Tests for the web app.
 *
 * Separate from the Vite build config because the build carries a plugin that
 * strips an emitted asset, and Tailwind, neither of which a test run needs —
 * and because the test environment is jsdom rather than a browser.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    environment: 'jsdom',
    /*
     * Threads, not forks. The default forked pool times out starting a worker
     * on this Windows setup — a harness problem, not a test one — and these
     * tests share no process-global state that would make threads unsafe. (The
     * engine package needs forks for the opposite reason: its native oracle
     * keeps C-level globals.)
     */
    pool: 'threads',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    globals: false,
    testTimeout: 30_000,
  },
});
