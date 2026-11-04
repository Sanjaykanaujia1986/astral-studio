import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    /*
     * Forks, not threads.
     *
     * The reference suite compares against `sweph`, a NATIVE addon. Swiss
     * Ephemeris keeps its ephemeris path and sidereal mode as C-level globals,
     * which are process-wide and therefore shared across worker threads — so
     * two test files running concurrently can reach into each other's
     * configuration. That surfaced as a one-in-many flake on the WASM-vs-native
     * speed comparison, passing in isolation and on repeat runs.
     *
     * A flaky assertion in a suite whose whole purpose is to certify numerical
     * correctness is worse than a slow one: it trains you to re-run instead of
     * to investigate. Each file gets its own process, and the shared-global
     * problem disappears.
     *
     * (The WASM engine itself is properly isolated — verified that two provider
     * instances keep separate sidereal state and that closing one does not
     * disturb the other. The shared state is entirely on the native oracle.)
     */
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
