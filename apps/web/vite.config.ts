import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Drop the duplicate WASM payload Vite emits but nothing loads.
 *
 * `swisseph-wasm` locates its payload with `new URL('../wasm/' + path,
 * import.meta.url)`. Vite sees the pattern, cannot evaluate the dynamic half,
 * and emits a hashed copy into /assets/ as a precaution. At runtime the
 * expression resolves against the built chunk's own URL and reaches
 * `/wasm/swisseph.wasm` — the copy staged into public/ — so the hashed one is
 * never requested. Verified by reading the network log of a production build:
 * only /wasm/* is fetched.
 *
 * It is 562 KB, which is 6.5% of the Android APK, shipped to every user to be
 * ignored. The plugin removes it after the bundle is generated, which is late
 * enough that nothing can still reference it and early enough that it never
 * reaches disk.
 */
function dropUnusedWasmDuplicate() {
  return {
    name: 'astro:drop-unused-wasm-duplicate',
    generateBundle(_options: unknown, bundle: Record<string, { type: string }>) {
      for (const fileName of Object.keys(bundle)) {
        if (fileName.startsWith('assets/') && fileName.endsWith('.wasm')) {
          delete bundle[fileName];
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dropUnusedWasmDuplicate()],
  resolve: {
    /*
     * Force a single React instance.
     *
     * The workspace packages (@astro/ui, @astro/i18n) are symlinked, so Vite
     * resolves their `react` import against the raw node_modules copy while app
     * code gets the pre-bundled one in .vite/deps. Two instances means two
     * separate hook dispatchers, and every hook called inside a workspace
     * component throws "Invalid hook call".
     *
     * It stayed hidden until those packages started using hooks — before the
     * i18n work they were pure render functions, so nothing tripped it.
     */
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Pre-bundling rewrites import.meta.url, which is how swisseph-wasm finds
    // its .wasm and .data payloads. Leaving it unoptimised keeps that intact.
    exclude: ['swisseph-wasm'],
    // Pre-bundle the linked workspace packages alongside app code so they share
    // the same React instance.
    include: ['react', 'react-dom', 'react-dom/client'],
  },
  server: { port: 5179, strictPort: true },
});
