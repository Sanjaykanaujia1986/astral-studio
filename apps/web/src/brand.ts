/**
 * Branding, in one place.
 *
 * "Astral Studio" is a working name, and the brief asks for branding to stay
 * configurable — so no component hardcodes the product name. Everything that
 * displays it reads from here, and a rename is this file plus the locale
 * catalogues' own `app.*` entries.
 *
 * Deliberately NOT read from `import.meta.env` at the point of use: a name
 * resolved at each call site is a name that ends up spelled three ways.
 */
export interface Brand {
  readonly name: string;
  readonly tagline: string;
  /** Shown in the footer beside the data attributions. */
  readonly legalName?: string;
  /** Short form for tight spaces — the mobile header, the nav rail collapsed. */
  readonly shortName: string;
  /**
   * Where the Corresponding Source is published.
   *
   * Not decoration. The app is AGPL-3.0-or-later, and §13 obliges a public
   * deployment to offer its source to every visitor from the running program
   * itself. The offer in Settings → About is rendered from this; until it
   * resolves to the current source the deployment is not compliant.
   */
  readonly sourceUrl?: string;
}

export const BRAND: Brand = {
  name: (import.meta.env.VITE_BRAND_NAME as string | undefined) ?? 'Astral Studio',
  shortName: (import.meta.env.VITE_BRAND_SHORT as string | undefined) ?? 'Astral',
  tagline:
    (import.meta.env.VITE_BRAND_TAGLINE as string | undefined)
    ?? 'Astrology calculation and research',
  ...(import.meta.env.VITE_SOURCE_URL
    ? { sourceUrl: import.meta.env.VITE_SOURCE_URL as string }
    : {}),
};
