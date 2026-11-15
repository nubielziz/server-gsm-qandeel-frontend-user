// The customer wallet page (`/account/wallet`): balance cards, notices (on hold, below zero, switched off) and the
// statement with its date range. The header pill and the nav item reuse `portal.customerNav.wallet`, `portal.storeBalance`
// and `common.header.*`. The merchant wallet page keeps its own texts (`merchant.wallet`) and only shares the components.
// The wallet is always US dollars, so the texts say so. The API's `memo` is English and may carry a staff reason: it is
// never shown, so the statement says what a line is by its kind (translated here) and by its order.
import { defineMessages } from "../define";

export const wallet = defineMessages({
  en: {
    metaTitle: "Wallet",
    page: {
      title: "Wallet",
      description: "Your store balance and every movement on it.",
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
        two: "{count} top-ups waiting",
        few: "{count} top-ups waiting",
        many: "{count} top-ups waiting",
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
  },
  ar: {
    metaTitle: "المحفظة",
    page: {
      title: "المحفظة",
      description: "رصيدك في المتجر وكل حركة عليه.",
      addFunds: "إضافة رصيد",
    },
    cards: {
      available: "الرصيد المتاح",
      availableHint: "جاهز للإنفاق. المبالغ بالدولار الأمريكي (USD).",
      balance: "الرصيد",
      balanceHint: "كل ما في محفظتك",
      pendingLabel: "إضافات رصيد قيد الانتظار",
      pending: {
        zero: "لا توجد عمليات إضافة رصيد بالانتظار",
        one: "عملية إضافة رصيد واحدة بالانتظار",
        two: "عمليتا إضافة رصيد بالانتظار",
        few: "{count} عمليات إضافة رصيد بالانتظار",
        many: "{count} عملية إضافة رصيد بالانتظار",
        other: "{count} عملية إضافة رصيد بالانتظار",
      },
      approx: "نحو {amount}",
    },
    notices: {
      frozenTitle: "رصيدك معلّق",
      frozenText:
        "منذ {date} لا يمكن استخدام رصيدك للدفع. ما زال رصيدك محفوظًا ويظهر هنا. يرجى التواصل مع الدعم إذا كان لديك أي استفسار.",
      negativeTitle: "رصيدك أقل من الصفر",
      negativeText:
        "أصبح رصيدك أقل من الصفر، مثلًا بعد عكس عملية إضافة رصيد بالبطاقة. لا يمكنك الدفع به حتى يعود أعلى من الصفر. يرجى التواصل مع الدعم إذا كان لديك أي استفسار.",
      disabledTitle: "رصيد المتجر متوقف مؤقتًا",
      disabledText: "إضافة الرصيد والدفع برصيد المتجر غير متاحين حاليًا.",
      disabledKept: "رصيدك محفوظ ويبقى ظاهرًا هنا.",
      backToAccount: "العودة إلى حسابي",
    },
    statement: {
      title: "كشف الحساب",
      description: "الأحدث أولًا. المبالغ بالدولار الأمريكي (USD).",
      rangeLabel: "تصفية الكشف حسب التاريخ",
      from: "من",
      to: "إلى",
      apply: "عرض",
      clear: "مسح التواريخ",
      rangeInvalid: "يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساويًا له.",
      caption: "كشف حساب المحفظة",
      columns: { date: "التاريخ", kind: "النوع", details: "التفاصيل", amount: "المبلغ", balanceAfter: "الرصيد بعد الحركة" },
      kinds: {
        deposit: "إضافة رصيد",
        b2c_payment: "دفع طلب",
        refund: "استرداد",
        adjustment: "تسوية",
        chargeback: "دفعة معكوسة",
      },
      order: "الطلب {id}",
      dash: "—",
      emptyTitle: "لا توجد حركات بعد",
      emptyText: "تظهر هنا عمليات إضافة الرصيد ومدفوعات الطلبات والمبالغ المستردة.",
      emptyRangeTitle: "لا حركات في هذه الفترة",
      emptyRangeText: "جرّب تواريخ أخرى، أو امسحها لعرض كل الحركات.",
    },
    errors: {
      loadTitle: "تعذّر تحميل محفظتك",
      statementTitle: "تعذّر تحميل الكشف",
      retry: "حاول مرة أخرى",
    },
  },
});
