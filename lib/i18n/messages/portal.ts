// Workspace chrome shared by the merchant portal and the customer area: navigation, pending-approval state.
import { defineMessages } from "../define";

export const portal = defineMessages({
  en: {
    workspace: "Workspace",
    merchantArea: "Merchant portal",
    customerArea: "My account",
    merchantNav: {
      overview: "Overview",
      services: "New order",
      orders: "Orders",
      wallet: "Wallet",
      invoices: "Invoices",
      apiKeys: "API keys",
      webhooks: "Webhooks",
      referrals: "Referrals",
      notifications: "Notifications",
      support: "Support",
      settings: "Settings",
      shop: "Back to the shop",
    },
    customerNav: {
      overview: "Overview",
      orders: "Orders",
      wallet: "Wallet",
      notifications: "Notifications",
      support: "Support",
      myTickets: "My tickets",
      settings: "Settings",
      shop: "Back to the shop",
    },
    // The phone tab bar's short labels (about ten characters: five columns on a 360px screen).
    tabs: {
      overview: "Overview",
      orders: "Orders",
      wallet: "Wallet",
      notifications: "Alerts",
      tickets: "Tickets",
      services: "Services",
      support: "Support",
    },
    // The live badges on the rail, the tab bar and the drawer: appended to the link's name ("Notifications, 3 unread").
    navBadges: {
      unread: ", {count} unread",
      inProgress: ", {count} in progress",
      newReply: ", new reply",
    },
    // The merchant's support pages (`/merchant/support`): the list, a new ticket and the thread.
    merchantSupport: {
      metaTitle: "Support",
      title: "Support",
      subtitle: "Your conversations with our support team. Replies appear here as they are written.",
      newMetaTitle: "New support ticket",
      newTitle: "New ticket",
      newSubtitle: "Tell us what happened. Our team answers in the conversation, and we email you if you miss a reply.",
      breadcrumbs: "Breadcrumb",
      threadMetaTitle: "Support ticket",
      notFoundTitle: "We could not find this ticket",
      notFoundText: "It may belong to another account, or the link is incomplete.",
      backToList: "Back to support",
    },
    servicesTitle: "Services & prices",
    searchServices: "Search services…",
    availableBalance: "Available balance",
    storeBalance: "Store balance",
    merchantRole: "Merchant account",
    customerRole: "Customer account",
    pending: {
      badge: "Waiting for approval",
      title: "Your merchant account is waiting for approval",
      body: "Our team reviews every new merchant. Until then you can complete your profile, secure your account and upload verification documents. Prices, orders and the wallet open as soon as you are approved.",
      profile: "Complete your profile",
      security: "Secure your account",
      verification: "Upload verification documents",
      unavailable: "This page opens once your merchant account is approved.",
    },
  },
});
