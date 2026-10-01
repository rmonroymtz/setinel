/**
 * Every selector the journey uses, in one place. The front is a Magento PWA
 * Studio app (React) that will migrate to Next.js, so this is the only module
 * that should change when it does.
 *
 * Class names are CSS Modules with a build hash suffix (`productList-item-usF`).
 * Anchor on the stable prefix (`[class*="productList-item-"]`), roles or text,
 * never on the hashed class. Values are Playwright selector strings.
 * Confirmed against https://chupaprecios.com.mx on 2026-09-30.
 */
export const selectors = {
  searchInput: 'input[name="search_query"]',
  /** One anchor per product card on the search results page. */
  resultLink: '[class*="productList-item-"] a[href$=".html"]',
  pdpRoot: '[class*="productFullDetail-root-"]',
  /** The page renders two h1 (mobile and desktop); callers pick the visible one. */
  pdpTitle: 'h1[class*="productFullDetail-productName-"]',
  pdpPrice: '[class*="productFullDetail-productPrice-"]',
  /** The carousel renders a 4px placeholder next to the real image; skip it. */
  pdpMainImage: 'img[class*="carousel-currentImage-"]:not([class*="placeholder"])',
  addToCart: '[class*="productFullDetail-root-"] >> role=button[name="Agregar al carrito"i]',
} as const;

// Hashed form: `.name-part-xyz` or a class attribute value ending in a hyphen plus a 3-character hash.
const HASHED_DOTTED = /\.[A-Za-z]\w*-\w+-[\w-]{3}(?![\w-])/;
const HASHED_ATTRIBUTE = /\[class[*^$~|]?=["'][^"']*-[\w-]{3}["']\]/;

/** Returns the keys of selectors that appear to depend on a build-hashed class. */
export function findHashedClassSelectors(all: Record<string, string>): string[] {
  return Object.entries(all)
    .filter(([, value]) => HASHED_DOTTED.test(value) || HASHED_ATTRIBUTE.test(value))
    .map(([key]) => key);
}
