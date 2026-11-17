// Notification center (the bell, the notifications page of both areas) and the unsubscribe page of marketing emails.
// The API's own texts are English only: errors are translated by code (messages/errors.ts), the notifications' own
// `title` and `body` come from the API and are shown as written.
// "Unread" counts are written without number agreement ("Unread: 3").
// `live` is the live stream's own text (feature 27): the toast of a new notification and the "New notifications" pill.
// `sound` is the switch of the bell's arrival chime on the notifications page header (owner, 2026-11-15).
import { defineMessages } from "../define";

export const notifications = defineMessages({
  en: {
    metaTitle: "Notifications",
    title: "Notifications",
    subtitle: "Order results, account alerts and news from us.",
    tabsLabel: "Show notifications",
    tabAll: "All",
    tabUnread: "Unread",
    emptyTitle: "No notifications yet",
    emptyText: "When something happens, like the result of an order, you will see it here.",
    emptyUnreadTitle: "You are all caught up",
    emptyUnreadText: "You have no unread notifications.",
    showAll: "Show all notifications",
    unread: "Unread",
    markRead: "Mark as read",
    markedRead: "Marked as read",
    markAllRead: "Mark all as read",
    markedAll: "{count} marked as read",
    markedNone: "Everything was already read",
    open: "Open",
    bell: "Notifications, {count} unread",
    bellNone: "Notifications",
    sound: { label: "Notification sound", on: "On", off: "Off" },
    live: {
      view: "View",
      many: "{count} new notifications",
      pill: "New notifications",
      pillAction: "Show",
    },
    categories: {
      announcement: "Announcement",
      marketing: "Offers",
      order: "Order",
      payment: "Payment",
      wallet: "Wallet",
      billing: "Billing",
      support: "Support",
      account: "Account",
      alert: "Alert",
    },
    unsubscribe: {
      metaTitle: "Stop marketing emails",
      title: "Stop marketing emails",
      text: "Press the button to stop receiving marketing emails from us. Nothing changes until you press it.",
      submit: "Stop marketing emails",
      doneTitle: "You are unsubscribed",
      doneText: "You will get no more marketing emails.",
      invalidTitle: "This link is not valid",
      invalidText:
        "It may be incomplete or out of date. Open the link in the email again, or turn marketing emails off in your account settings.",
      backHome: "Back to the shop",
    },
  },
});

export type NotificationsMessages = (typeof notifications)["en"];
