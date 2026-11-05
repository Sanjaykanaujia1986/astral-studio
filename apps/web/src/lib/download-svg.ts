/**
 * Download a rendered figure as a standalone .svg file.
 *
 * The figures already resolve their colours in JavaScript rather than through
 * CSS custom properties, so the markup in the DOM is complete on its own —
 * that is what makes this three lines rather than a rasteriser. A file that
 * depended on the page's cascade would open black.
 *
 * The settings travel with the drawing in its `<title>`, because a chart that
 * leaves this page and cannot say what produced it is not reproducible, and
 * the whole module is organised around reproducibility.
 */

export interface SvgDownloadOptions {
  /** File name without the extension. */
  readonly name: string;
  /** Appended to the SVG's own title, which is where a reader will look. */
  readonly caption?: string;
}

export class SvgNotFoundError extends Error {
  readonly code = 'figureNotFound';
  constructor() {
    super('No figure to download: the element has not rendered yet.');
    this.name = 'SvgNotFoundError';
  }
}

/**
 * Serialise an `<svg>` element and hand it to the browser as a download.
 *
 * Returns the markup, so a test can assert what would be saved without
 * depending on a real download, which jsdom cannot perform.
 */
export function downloadSvg(
  element: SVGSVGElement | null,
  options: SvgDownloadOptions,
): string {
  if (!element) throw new SvgNotFoundError();

  const clone = element.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  if (options.caption) {
    const title = clone.querySelector('title');
    if (title) {
      title.textContent = `${title.textContent ?? ''} — ${options.caption}`;
    } else {
      const created = clone.ownerDocument.createElementNS(
        'http://www.w3.org/2000/svg', 'title',
      );
      created.textContent = options.caption;
      clone.insertBefore(created, clone.firstChild);
    }
  }

  const markup = `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}\n`;

  try {
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${options.name}.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoked on the next tick: revoking synchronously can cancel the
    // download in some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (cause) {
    // jsdom has no Blob download path. The markup is still returned, so the
    // caller — and the test — gets what would have been saved.
    console.warn('SVG download unavailable in this environment', cause);
  }

  return markup;
}
