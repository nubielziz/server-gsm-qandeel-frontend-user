// The wallet page (`/account/wallet`), one page for every account: the texts of the store balance of a retail rank (balance cards,
// notices for a hold, a negative balance and a switched-off balance, the statement with its date range) and, under `merchant`,
// those of the wallet of a merchant rank (four cards, an online-payment note, the statement and its CSV). The header pill and the
// nav item reuse `portal.*` and `common.header.*`. Both wallets are in US dollars, so the texts say so. The API's `memo` of a
// store balance is English and may carry a staff reason: it is never shown, so that statement says what a line is by its kind
// (translated here) and by its order.

export const wallet = {
  metaTitle: "Wallet",
  page: {
    title: "Wallet",
    description: "Your balance and every movement on it.",
    addFunds: "Add funds",
  },
  cards: {
    available: "Available balance",
    availableHint: "Ready to spend. Amounts are in US dollars (USD).",
    balance: "Balance",
    balanceHint: "Everything in your wallet",
    pendingLabel: "Pending top-ups",
    pending: {
      zero: "No top-ups waiting",
      one: "1 top-up waiting",
      other: "{count} top-ups waiting",
    },
    approx: "about {amount}",
  },
  notices: {
    frozenTitle: "Your balance is on hold",
    frozenText:
      "Since {date} your balance cannot be used to pay. It is still yours and stays here. Please contact support if you have questions.",
    negativeTitle: "Your balance is below zero",
    negativeText:
      "Your balance went below zero, for example after a card top-up was reversed. You cannot pay with it until it is above zero again. Please contact support if you have questions.",
    disabledTitle: "The store balance is paused",
    disabledText: "Adding funds and paying with your store balance are not available at the moment.",
    disabledKept: "Your balance is kept and stays visible here.",
    backToAccount: "Back to my account",
  },
  statement: {
    title: "Statement",
    description: "Newest first. Amounts are in US dollars (USD).",
    rangeLabel: "Filter the statement by date",
    from: "From",
    to: "To",
    apply: "Show",
    clear: "Clear dates",
    rangeInvalid: "The start date must be on or before the end date.",
    caption: "Wallet statement",
    columns: { date: "Date", kind: "Type", details: "Details", amount: "Amount", balanceAfter: "Balance after" },
    kinds: {
      deposit: "Top-up",
      b2c_payment: "Order payment",
      refund: "Refund",
      adjustment: "Adjustment",
      chargeback: "Reversed payment",
      wallet_transfer: "Balance transfer",
    },
    order: "Order {id}",
    dash: "—",
    emptyTitle: "No transactions yet",
    emptyText: "Top-ups, order payments and refunds appear here.",
    emptyRangeTitle: "Nothing in this period",
    emptyRangeText: "Try other dates, or clear them to see every transaction.",
  },
  errors: {
    loadTitle: "We could not load your wallet",
    statementTitle: "We could not load the statement",
    retry: "Try again",
  },

  // The wallet of a merchant rank (`GET /client/wallet`): credit and reserved amounts are shown as the API sends them.
  merchant: {
    cards: {
      available: "Available balance",
      availableHint: "Balance plus credit limit",
      balance: "Balance",
      balanceHint: "Negative while you use your credit",
      reserved: "Reserved",
      reservedHint: "Held for open orders",
      creditLimit: "Credit limit",
      creditLimitHint: "Extra spending allowed",
    },
    onlineNote:
      "If you just paid online, your balance updates once the payment is confirmed. Bank transfers are credited after our team reviews your receipt.",
    statement: {
      title: "Account statement",
      description: "Newest first.",
      download: "Download statement (CSV)",
      exporting: "Exporting…",
      exportFailed: "The export could not be created.",
      caption: "Account statement",
      columns: { date: "Date", kind: "Type", details: "Description", amount: "Amount", balanceAfter: "Balance after" },
      emptyTitle: "No transactions yet",
      emptyText: "Deposits, order charges and refunds appear here.",
      kinds: {
        deposit: "Deposit",
        withdrawal: "Withdrawal",
        order_hold: "Order charge",
        order_release: "Order refund",
        commission: "Commission",
        adjustment: "Adjustment",
        refund: "Refund",
        fee: "Fee",
        wallet_transfer: "Balance transfer",
      },
      dash: "—",
    },
  },
};
