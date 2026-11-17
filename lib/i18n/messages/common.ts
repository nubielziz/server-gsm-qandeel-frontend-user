// Shared strings: brand, header and footer, the auth shell, generic actions, pagination, status labels, service types,
// availability, delivery lines, quantity rules and per-unit prices (built by lib/quantity.ts and lib/store/delivery.ts),
// empty / error texts. Server Components import them; Client Components get the pieces they need as props (or through
// <UiTextProvider>, components/ui/ui-text.tsx, for the generic `ui` group).

export const common = {
  brand: {
    name: "GSM Store",
    tagline: "Digital Services Marketplace",
    description:
      "IMEI checks, unlocks, tool activations and digital credits for GSM professionals and the customers they serve.",
    logoAlt: "GSM Store home",
  },

  /** Header, navigation and footer. */
  nav: {
    label: "Main navigation",
    home: "Home",
    allServices: "All services",
    imeiCheck: "IMEI check",
    trackOrder: "Track an order",
    help: "Help center",
    support: "Support",
    merchants: "For merchants",
    menu: "Menu",
    allCategories: "All categories",
    categories: "Categories",
  },
  header: {
    skipToContent: "Skip to content",
    searchLabel: "Search services",
    searchPlaceholder: "Search IMEI check, unlock, activation…",
    openSearch: "Open search",
    closeSearch: "Close search",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    signIn: "Sign in",
    accountMenu: "Account menu",
    myAccount: "My account",
    myOrders: "My orders",
    merchantPortal: "Merchant portal",
    signOut: "Sign out",
    signOutMerchant: "Sign out of merchant account",
    signOutCustomer: "Sign out of customer account",
    signingOut: "Signing out…",
    wallet: "Wallet balance",
    currency: "Currency",
    signedInAsCustomer: "Customer",
    signedInAsMerchant: "Merchant",
    notifications: "Notifications",
    storeBalance: "Store balance",
    myWallet: "Wallet",
  },
  footer: {
    label: "Site footer",
    shop: "Shop",
    help: "Help",
    legal: "Legal",
    merchants: "Merchants",
    terms: "Terms of service",
    privacy: "Privacy policy",
    refund: "Refund policy",
    cookies: "Cookie policy",
    portal: "Merchant portal",
    becomeMerchant: "Become a merchant",
    rights: "© {year} GSM Store. All rights reserved.",
  },
  checkoutHeader: {
    backToStore: "Back to store",
    helpCenter: "Help center",
  },
  workspace: {
    navLabel: "Workspace navigation",
    openNav: "Open navigation",
    closeNav: "Close navigation",
    breadcrumbLabel: "Breadcrumb",
    accountMenu: "Account menu",
    /** The phone tab bar's landmark (never "Workspace navigation": that names the rail and the drawer). */
    tabsLabel: "Shortcuts",
  },

  /** Left panel of the sign-in and sign-up pages. */
  auth: {
    headline: "Your GSM services, in one account.",
    subtitle:
      "Order IMEI checks, unlocks, tool activations and digital credits. Built for repair shops and the customers they serve.",
    featureServicesTitle: "Wide range of services",
    featureServicesText: "IMEI checks, server credits and tool activations.",
    featureTrackingTitle: "Tracked delivery",
    featureTrackingText: "Follow every order from payment to completion.",
    featureProsTitle: "Made for professionals",
    featureProsText: "Wallet, invoices and API access for GSM businesses.",
    terms: "Terms of service",
    privacy: "Privacy policy",
    backToStore: "Back to store",
  },

  actions: {
    save: "Save",
    saveChanges: "Save changes",
    cancel: "Cancel",
    close: "Close",
    retry: "Try again",
    back: "Back",
    continue: "Continue",
    next: "Next",
    previous: "Previous",
    search: "Search",
    loading: "Loading…",
    signIn: "Sign in",
    signOut: "Sign out",
    createAccount: "Create account",
    edit: "Edit",
    delete: "Delete",
    confirm: "Confirm",
    copy: "Copy",
    copied: "Copied",
    download: "Download",
    view: "View",
    viewAll: "View all",
    apply: "Apply",
    reset: "Reset",
    clear: "Clear",
    submit: "Submit",
    add: "Add",
    remove: "Remove",
    show: "Show",
    hide: "Hide",
    more: "More",
    refresh: "Refresh",
    goHome: "Go to home page",
    browseServices: "Browse services",
  },

  /** Strings used inside generic Client Components (via <UiTextProvider>). */
  ui: {
    close: "Close",
    dismiss: "Dismiss notification",
    loading: "Loading",
    optional: "(optional)",
    required: "required",
    showPassword: "Show password",
    hidePassword: "Hide password",
    copy: "Copy",
    copied: "Copied",
    menu: "Menu",
  },

  pagination: {
    label: "Pagination",
    page: "Page {page} of {pages}",
    previous: "Previous page",
    next: "Next page",
    goTo: "Go to page {page}",
    results: {
      zero: "No results",
      one: "1 result",
      other: "{count} results",
    },
  },

  /** Status labels, by kind. Tones and icons live in components/ui/status-badge.tsx. */
  status: {
    order: { pending: "Pending", processing: "Processing", completed: "Completed", rejected: "Rejected" },
    invoice: { open: "Unpaid", paid: "Paid", void: "Void" },
    ticket: { new: "New", open: "In progress", pending: "Awaiting reply", resolved: "Resolved" },
    account: { pending: "Pending approval", active: "Active", suspended: "Suspended" },
    kyc: { none: "Not submitted", pending: "In review", approved: "Verified", rejected: "Rejected" },
    delivery: { pending: "Pending", succeeded: "Delivered", failed: "Failed" },
    checkout: { open: "Awaiting payment", paid: "Paid", expired: "Expired" },
    request: { open: "Received", in_progress: "In progress", completed: "Completed", rejected: "Rejected" },
    verification: { verified: "Verified", unverified: "Not verified" },
    topUp: {
      awaiting_payment: "Awaiting payment",
      in_review: "In review",
      credited: "Credited",
      rejected: "Rejected",
      cancelled: "Cancelled",
    },
  },

  serviceType: {
    imei: "IMEI check",
    server: "Server credits",
    remote: "Remote activation",
    file: "File service",
  },

  /** Whether a service is delivered at once from stock or processed after the order. Never a stock count. */
  availability: {
    inStock: "In stock",
    onRequest: "On request",
    instant: "Instant delivery",
  },

  /** Delivery lines. `{time}` comes from formatMinutes (lib/merchant/format.ts); `{note}` is the staff delivery note. */
  delivery: {
    label: "Delivery",
    within: "Delivered within {time}",
    whileStock: "Instant delivery while stock lasts, otherwise within {time}",
    whileStockNote: "Instant delivery while stock lasts. Otherwise: {note}",
  },

  /** Quantity rules and per-unit prices (lib/quantity.ts builds the sentences). `{price}` is a formatted amount. */
  quantity: {
    one: "1 per order",
    exact: "{count} per order",
    range: "{min} to {max} per order",
    packs: "Packs of {options}",
    invalidRange: "Enter a quantity from {min} to {max}.",
    invalidPacks: "Choose one of these quantities: {options}.",
    invalidExact: "This service sells {count} per order.",
    perUnit: "per unit",
    from: "From {price}",
    exactFor: "{count} for {price}",
    packFor: "{count} for about {price}",
    subtotal: {
      zero: "Subtotal ({count} units)",
      one: "Subtotal (1 unit)",
      other: "Subtotal ({count} units)",
    },
    estimated: "Estimated",
  },

  states: {
    emptyTitle: "Nothing here yet",
    emptyText: "When there is something to show, it will appear here.",
    errorTitle: "Something went wrong",
    errorText: "We could not load this. Please try again.",
    reference: "Reference: {id}",
    notFoundTitle: "Page not found",
    notFoundText: "The page you are looking for does not exist or has moved.",
    errorPageTitle: "We hit a problem",
    errorPageText: "Something went wrong on our side. Try again, or come back in a moment.",
  },
};

export type CommonMessages = typeof common;

type StatusMessages = CommonMessages["status"];
/** The status families that have a label and a tone (see components/ui/status-badge.tsx). */
export type StatusKind = keyof StatusMessages;

/** The translated label of a status: `statusLabel(t, "order", "completed")` → "Completed". Falls back to the raw value. */
export function statusLabel<K extends StatusKind>(t: CommonMessages, kind: K, status: string): string {
  const labels = t.status[kind] as Record<string, string>;
  return labels[status] ?? status;
}
