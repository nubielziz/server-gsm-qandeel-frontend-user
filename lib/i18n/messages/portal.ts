// Words of the one account frame: the navigation (rail, drawer, phone tab bar), the header, the live badges and the
// password gate. Every account has the same pages under /account; a merchant rank has a few more places.

export const portal = {
  // The breadcrumb's area name, and the line under the name while the session is still being read.
  area: "My account",
  accountRole: "Your account",
  nav: {
    overview: "Overview",
    orders: "Orders",
    wallet: "Wallet",
    invoices: "Invoices",
    notifications: "Notifications",
    support: "Support",
    settings: "Settings",
    shop: "Back to the shop",
  },
  // The phone tab bar's short labels (about ten characters: five columns on a 360px screen).
  tabs: {
    overview: "Overview",
    orders: "Orders",
    wallet: "Wallet",
    notifications: "Alerts",
    support: "Support",
  },
  // The live badges on the rail, the tab bar and the drawer: appended to the link's name ("Notifications, 3 unread").
  navBadges: {
    unread: ", {count} unread",
    inProgress: ", {count} in progress",
    newReply: ", new reply",
  },
  // Header titles of the pages the static frame does not list (a merchant rank's own places).
  apiKeysTitle: "API keys",
  searchServices: "Search services…",
  availableBalance: "Available balance",
  storeBalance: "Store balance",
  // The warning above a page while an account still has the temporary password staff gave it.
  mustChange: {
    title: "Choose a new password",
    text: "Support gave you a temporary password. Set your own below to keep using your account.",
  },
};
