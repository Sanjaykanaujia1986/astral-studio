/**
 * Capacitor configuration.
 *
 * The Android build is the SAME application as the web build — one codebase,
 * one calculation engine, one set of numbers. Capacitor serves the built `dist`
 * from a local server inside the WebView, which is what makes the root-absolute
 * asset paths (`/wasm/swisseph.wasm`, `/data/cities.json`) work unchanged. A
 * `file://` wrapper would have needed relative paths and a different fetch
 * strategy, and that divergence is precisely what this project cannot afford:
 * two loaders would eventually load two different things.
 *
 * Nothing here reaches the network. The ephemeris, the WASM payload and the
 * city database are all bundled, so the app computes charts with the device in
 * flight mode — which is the point of an offline-first design and is verified
 * rather than assumed.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.electech.astro',
  appName: 'Astro',
  webDir: 'dist',
  android: {
    /*
     * Ship the WebView's own scheme rather than file://. Capacitor's default
     * (https://localhost) gives a secure origin, which WASM instantiation and
     * `fetch` of bundled assets both require.
     */
    allowMixedContent: false,
    // The engine is deterministic; there is nothing to gain from letting the
    // system WebView be replaced under it, and a great deal to lose.
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
