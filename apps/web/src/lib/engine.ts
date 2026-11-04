/**
 * Engine and location-database singletons.
 *
 * Both are expensive to create and stateless once ready, so they are created
 * once and shared. Initialisation is exposed as a promise rather than hidden,
 * so the UI can show real progress instead of a blank screen while ~2 MB of
 * ephemeris data loads.
 */
import { SwissEphWasmProvider } from '@astro/engine';
import { LocationDatabase, type LocationDataset } from '@astro/locations';

let providerPromise: Promise<SwissEphWasmProvider> | undefined;
let locationsPromise: Promise<LocationDatabase> | undefined;

export function getProvider(): Promise<SwissEphWasmProvider> {
  providerPromise ??= (async () => {
    const provider = new SwissEphWasmProvider();
    await provider.init();
    return provider;
  })();
  return providerPromise;
}

export function getLocations(): Promise<LocationDatabase> {
  locationsPromise ??= (async () => {
    const response = await fetch('/data/cities.json');
    if (!response.ok) {
      throw new Error(
        `Could not load the city database (HTTP ${response.status}). ` +
          'Run: npm run build:data -w packages/locations',
      );
    }
    return new LocationDatabase((await response.json()) as LocationDataset);
  })();
  return locationsPromise;
}
