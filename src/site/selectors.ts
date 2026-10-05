/**
 * Every selector the journey uses, in one place. The front is a Magento PWA
 * Studio app (React) that will migrate to Next.js, so this is the only module
 * that should change when it does.
 *
 * Class names are CSS Modules with a build hash suffix (`productList-item-usF`).
 * Anchor on the stable prefix (`[class*="productList-item-"]`), roles or text,
 * never on the hashed class. Values are Playwright selector strings.
 * Confirmed against https://chupaprecios.com.mx on 2026-09-30 (cart and checkout selectors on 2026-10-05).
 */
export const selectors = {
  searchInput: 'input[name="search_query"]',
  /**
   * Grey shimmer blocks shown while a store's results are still loading. Stores
   * fill in one after another, so results are complete only once none is left.
   */
  loadingPlaceholder: '[class*="shimmer-root-"]',
  /** One anchor per product card on the search results page. */
  resultLink: '[class*="productList-item-"] a[href$=".html"]',
  pdpRoot: '[class*="productFullDetail-root-"]',
  /** The page renders two h1 (mobile and desktop); callers pick the visible one. */
  pdpTitle: 'h1[class*="productFullDetail-productName-"]',
  pdpPrice: '[class*="productFullDetail-productPrice-"]',
  /** The carousel renders a 4px placeholder next to the real image; skip it. */
  pdpMainImage: 'img[class*="carousel-currentImage-"]:not([class*="placeholder"])',
  addToCart: '[class*="productFullDetail-root-"] >> role=button[name="Agregar al carrito"i]',
  /**
   * Item count badge on the header cart button. It is not rendered while the
   * cart is empty, so seeing it means the add-to-cart request went through.
   */
  cartCounter: '[class*="cartTrigger-counter-"]',
  /** One row per line item on the cart page (`/cart`). */
  cartItem: '[class*="cartPage-root-"] li[class*="product-root-"]',
  /** The product name link of a cart line; its URL slug differs from the PDP's, so match by name. */
  cartItemName: '[class*="cartPage-root-"] li[class*="product-root-"] a[class*="product-nameLink-"]',
  /** The "Subtotal" row of the cart page price summary (shipping and total are separate rows). */
  cartSubtotal: '[class*="priceSummary-lineItems-"]:has-text("Subtotal")',

  /*
   * Checkout (`/checkout`) is an Amasty one-step checkout: every section is a
   * `[data-block]` on one page and opens (`data-expanded="true"`) as the previous
   * one is saved. The page also renders hidden duplicates of some fields, so
   * every selector is scoped to its block and callers act on the visible match.
   */
  guestEmail: '[data-block="shipping_address"] input[name="email"]',
  guestFirstName: '[data-block="shipping_address"] input[name="firstname"]',
  guestLastName: '[data-block="shipping_address"] input[name="lastname"]',
  guestPhone: '[data-block="shipping_address"] input[name="telephone"]',
  /**
   * Google Places search box. The street, number, postal code, colonia and state
   * fields only appear once a suggestion is picked, and the site fills them from it.
   */
  addressAutocomplete: '[data-block="shipping_address"] input#autocomplete',
  /** A Google Places suggestion (Google's own class, outside the app's CSS modules). */
  addressSuggestion: ".pac-container .pac-item",
  addressStreet: '[data-block="shipping_address"] input[name="street[0]"]',
  /** "Referencias", free text delivery notes. */
  addressReferences: '[data-block="shipping_address"] input[name="custom_attributes.custom_field_6"]',
  /** "Guardar": saves the address and opens the shipping method section. */
  saveAddress: '[data-block="shipping_address"] [class*="block-nextButton-"]',
  /** Header of the address section; once saved it reads back the saved address. */
  shippingAddressSummary: "#osc-shipping_address-heading",
  shippingMethodOpen: '[data-block="shipping_method"][data-expanded="true"]',
  shippingMethodOption: '[data-block="shipping_method"] input[id^="shipping_method--"]',
  /** "Siguiente": confirms the shipping method and opens the payment section. */
  shippingMethodNext: '[data-block="shipping_method"] [class*="block-nextButton-"]',
  /** Payment method radios. Only ever read: the journey stops before choosing one. */
  paymentMethodOption: '[data-block="payment_method"][data-expanded="true"] input[id^="paymentMethod--"]',
  paymentMethodLabel: '[data-block="payment_method"] [class*="paymentMethods-radio_label-"]',
  /** Product name of each line of the checkout order summary. */
  checkoutItemName: 'li[class*="productCheckout-root-"] [class*="productCheckout-name-"] a',
  checkoutSubtotal: '[data-block="summary"] [class*="priceSummary-lineItems-"]:has-text("Subtotal")',
} as const;

/**
 * What the journey must never click, because it places the order or starts a
 * payment. `src/site/order-guard.ts` refuses any click whose selector contains
 * one of these selectors or keywords, or whose element reads like one of these
 * texts. The cart's checkout button and the place-order button both read
 * "Finalizar compra", so the journey opens `/checkout` by URL instead.
 */
export const orderPlacingDenylist = {
  selectors: [
    '[class*="placeOrderButton-"]',
    '[class*="checkoutButton-"]',
    '[data-block="payment_method"]',
    'input[id^="paymentMethod--"]',
    '[class*="paypal"]',
    'iframe[title*="PayPal"]',
  ],
  /** Lower-case fragments matched anywhere in a selector string. */
  selectorKeywords: ["placeorder", "place_order", "paymentmethod", "payment_method", "paypal", "checkoutbutton"],
  /** Whole words or phrases, matched without case and accents in selectors and element texts. */
  texts: [
    "finalizar compra",
    "realizar pedido",
    "confirmar compra",
    "confirmar pedido",
    "place order",
    "comprar ahora",
    "pagar",
    "pay now",
    "paypal",
  ],
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
