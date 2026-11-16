// Sign-in, sign-up and the email-link pages (customer and merchant). Server pages read the namespace with
// `getMessages(auth)` and pass the strings a Client Component needs as props.
import { defineMessages } from "../define";

export const auth = defineMessages({
  en: {
    surfaces: { label: "Account type", customer: "Customer", merchant: "Merchant" },
    fields: {
      email: "Email address",
      emailPlaceholder: "name@example.com",
      password: "Password",
      passwordPlaceholder: "Enter your password",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      passwordRules:
        "Use 10 to 128 characters with at least 5 different ones. Avoid common words, number sequences and parts of your name or email.",
      passwordsDontMatch: "The two passwords do not match.",
      code: "6-digit code",
    },
    shared: {
      securityCheckWait: "Please wait for the security check to finish, then try again.",
      backToSignIn: "Back to sign in",
      signIn: "Sign in",
      requestNewLink: "Request a new link",
      checkEmailTitle: "Check your email",
      useDifferentEmail: "Use a different email",
    },

    signIn: {
      metaTitle: "Sign in",
      title: "Sign in",
      subtitle: "Welcome back to your account.",
      submit: "Sign in",
      forgot: "Forgot password?",
      magicLinkCustomers: "Email me a sign-in link (customers)",
      oneFormHint: "One form for customers and merchants.",
      applyMerchant: "Apply as a merchant",
      or: "or",
      noAccount: "Don't have an account?",
      createAccount: "Create account",
      invalidCredentials: "The email or password is incorrect.",
      expired: "Your sign-in expired. Start again.",
      magic: {
        title: "Email me a sign-in link",
        text: "We email you a link that signs you in, so there is no password to remember. If you are new here, we create your account.",
        submit: "Email me the link",
        usePassword: "Use my password instead",
        sentText:
          "If that address can sign in, a link is on its way to {email}. It works once and expires in 1 hour. Check your spam folder if you do not see it.",
      },
      totp: {
        title: "Two-step verification",
        text: "Open your authenticator app and enter the 6-digit code for your GSM Store account.",
        submit: "Verify and sign in",
        invalidCode: "That code is not right. Check the app and try again.",
      },
      newPassword: {
        title: "Choose your own password",
        text: "Our team gave you a temporary password. Choose a new one to continue.",
        submit: "Save and continue",
      },
      merchantNewPassword: {
        title: "Choose your own password",
        text: "Our team gave you a temporary password. Choose a new one to continue.",
        submit: "Save and continue",
      },
      link: {
        title: "You opened a sign-in link",
        text: "Select the button to finish signing in. We ask you to confirm so that an email scanner cannot use the link up before you.",
        submit: "Sign in to GSM Store",
        expiredTitle: "This sign-in link has expired",
        expiredText: "Links work once and last 1 hour. Request a new one and we will email it right away.",
      },
    },

    signUp: {
      metaTitle: "Create account",
      title: "Create your account",
      subtitle: "Choose how you will use GSM Store.",
      choose: "I am a",
      customer: {
        title: "Customer",
        text: "Buy IMEI checks, unlocks and activations for yourself. Pay at checkout and follow every order.",
      },
      merchant: {
        title: "Merchant",
        text: "For repair shops and resellers. Our team approves your account, then you get group prices, a wallet and API access.",
      },
      customerForm: {
        hint: "We email you a link that creates your account and signs you in. No password to remember.",
        submit: "Email me a sign-in link",
        sentText:
          "If that address can sign in, a link is on its way to {email}. It works once and expires in 1 hour. Check your spam folder if you do not see it.",
      },
      merchantInfo: {
        intro: "A merchant account is for businesses that resell GSM services.",
        points: [
          "Our team opens every merchant account with you on WhatsApp.",
          "Group prices, a prepaid wallet and invoices.",
          "API keys and webhooks to connect your own tools.",
        ],
        submit: "Apply as a merchant",
      },
      haveAccount: "Already have an account?",
    },

    forgot: {
      metaTitle: "Reset your password",
      title: "Reset your password",
      subtitle: "Enter your email and we will send you a link to choose a new password.",
      chooseHint: "Customers and merchants reset their password separately. Choose your account type.",
      customerHint: "Signed in with an email link so far? Use this to set your first password.",
      submit: "Email me a reset link",
      sentTitle: "Check your email",
      sentText:
        "If an account exists for {email}, a link to choose a new password is on its way. It works once and expires in 1 hour.",
    },

    setPassword: {
      metaTitle: "Choose a password",
      title: "Choose a password",
      subtitle: "Pick a password for your account.",
      submit: "Save password",
      missingTitle: "This page needs the link from your email",
      missingText: "Open the link in your email again. If it does not work, request a new one.",
      expiredTitle: "This link has expired",
      expiredText: "Links work once and last 1 hour. Request a new one and we will email it right away.",
      doneTitle: "Your password is saved",
      doneText: "You were signed out on every device. Sign in with your new password.",
    },

    verifyEmail: {
      metaTitle: "Confirm your email",
      title: "Confirm your email",
      customerText: "Confirm your email address to finish signing in to GSM Store.",
      customerSubmit: "Confirm and sign in",
      merchantText: "Confirm your email address for your GSM Store merchant account.",
      merchantSubmit: "Verify my email",
      missingTitle: "This page needs the link from your email",
      missingText: "Open the link in your email again. If it does not work, sign in and ask for a new one.",
      expiredTitle: "This link has expired",
      expiredText: "Verification links work once and last 1 hour. You can still sign in. Contact support if you need a new link.",
      merchantDoneTitle: "Your email is verified",
      merchantDoneText:
        "Our team reviews every new merchant account before you can place orders. Sign in at any time to see the status of your account.",
    },

    register: {
      metaTitle: "Apply as a merchant",
      title: "Apply as a merchant",
      subtitle: "Merchant accounts are opened by our team. Message us on WhatsApp and a team member will complete the steps with you.",
      stepsLabel: "How to apply",
      steps: [
        "Message us on WhatsApp.",
        "Tell us your name, company, country and email.",
        "Our team reviews the request and sends you a link to set your password.",
      ],
      chat: "Chat on WhatsApp",
      opensNewTab: "opens WhatsApp in a new tab",
      numberLabel: "Or message this number on WhatsApp:",
      message: "Hello, I would like to open a merchant account.",
      referralSentence: "Referral code: {code}.",
      referralNote: "The referral code {code} will be included in your message.",
      unavailableText: "Merchant accounts are opened by our team. Contact support and we will help you open yours.",
      contactSupport: "Contact support",
      haveAccount: "Already a merchant?",
    },
  },

  ar: {
    surfaces: { label: "نوع الحساب", customer: "عميل", merchant: "تاجر" },
    fields: {
      email: "البريد الإلكتروني",
      emailPlaceholder: "name@example.com",
      password: "كلمة المرور",
      passwordPlaceholder: "أدخل كلمة المرور",
      newPassword: "كلمة المرور الجديدة",
      confirmPassword: "تأكيد كلمة المرور الجديدة",
      passwordRules:
        "استخدم من 10 إلى 128 حرفًا، منها 5 أحرف مختلفة على الأقل. تجنّب الكلمات الشائعة وتسلسلات الأرقام وأجزاء اسمك أو بريدك.",
      passwordsDontMatch: "كلمتا المرور غير متطابقتين.",
      code: "الرمز المكوّن من 6 أرقام",
    },
    shared: {
      securityCheckWait: "انتظر حتى ينتهي الفحص الأمني ثم حاول مرة أخرى.",
      backToSignIn: "العودة إلى تسجيل الدخول",
      signIn: "تسجيل الدخول",
      requestNewLink: "اطلب رابطًا جديدًا",
      checkEmailTitle: "تحقّق من بريدك الإلكتروني",
      useDifferentEmail: "استخدم بريدًا آخر",
    },

    signIn: {
      metaTitle: "تسجيل الدخول",
      title: "تسجيل الدخول",
      subtitle: "أهلًا بعودتك إلى حسابك.",
      submit: "تسجيل الدخول",
      forgot: "نسيت كلمة المرور؟",
      magicLinkCustomers: "أرسل لي رابط دخول (للعملاء)",
      oneFormHint: "نموذج واحد للعملاء والتجار.",
      applyMerchant: "قدّم طلبًا كتاجر",
      or: "أو",
      noAccount: "ليس لديك حساب؟",
      createAccount: "إنشاء حساب",
      invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      expired: "انتهت صلاحية تسجيل الدخول. ابدأ من جديد.",
      magic: {
        title: "أرسل لي رابط دخول",
        text: "نرسل إلى بريدك رابطًا يسجّل دخولك دون الحاجة إلى كلمة مرور. وإن كنت جديدًا لدينا فسننشئ لك حسابًا.",
        submit: "أرسل لي الرابط",
        usePassword: "استخدم كلمة المرور بدلًا من ذلك",
        sentText:
          "إن كان بإمكان هذا البريد تسجيل الدخول فهناك رابط في طريقه إلى {email}. يعمل الرابط مرة واحدة وتنتهي صلاحيته بعد ساعة. تحقّق من مجلد الرسائل غير المرغوب فيها إن لم تجده.",
      },
      totp: {
        title: "التحقق بخطوتين",
        text: "افتح تطبيق المصادقة وأدخل الرمز المكوّن من 6 أرقام الخاص بحسابك في GSM Store.",
        submit: "تحقّق وسجّل الدخول",
        invalidCode: "الرمز غير صحيح. تحقّق من التطبيق وحاول مرة أخرى.",
      },
      newPassword: {
        title: "اختر كلمة مرورك الخاصة",
        text: "أعطاك فريقنا كلمة مرور مؤقتة. اختر كلمة مرور جديدة للمتابعة.",
        submit: "احفظ وتابع",
      },
      merchantNewPassword: {
        title: "اختر كلمة مرورك الخاصة",
        text: "أعطاك فريقنا كلمة مرور مؤقتة. اختر كلمة مرور جديدة للمتابعة.",
        submit: "احفظ وتابع",
      },
      link: {
        title: "فتحتَ رابط تسجيل الدخول",
        text: "اضغط على الزر لإتمام تسجيل الدخول. نطلب منك التأكيد حتى لا يستهلك ماسح البريد الرابط قبلك.",
        submit: "تسجيل الدخول إلى GSM Store",
        expiredTitle: "انتهت صلاحية رابط الدخول",
        expiredText: "يعمل الرابط مرة واحدة ولمدة ساعة. اطلب رابطًا جديدًا وسنرسله إلى بريدك فورًا.",
      },
    },

    signUp: {
      metaTitle: "إنشاء حساب",
      title: "أنشئ حسابك",
      subtitle: "اختر كيف ستستخدم GSM Store.",
      choose: "أنا",
      customer: {
        title: "عميل",
        text: "اشترِ فحوصات IMEI وخدمات فك الشبكات والتفعيل لنفسك. ادفع عند الإتمام وتابع كل طلب.",
      },
      merchant: {
        title: "تاجر",
        text: "لمحلات الصيانة والموزّعين. يوافق فريقنا على حسابك، ثم تحصل على أسعار المجموعات ومحفظة ووصول إلى واجهة API.",
      },
      customerForm: {
        hint: "نرسل إلى بريدك رابطًا ينشئ حسابك ويسجّل دخولك. لا حاجة لتذكّر كلمة مرور.",
        submit: "أرسل لي رابط دخول",
        sentText:
          "إن كان بإمكان هذا البريد تسجيل الدخول فهناك رابط في طريقه إلى {email}. يعمل الرابط مرة واحدة وتنتهي صلاحيته بعد ساعة. تحقّق من مجلد الرسائل غير المرغوب فيها إن لم تجده.",
      },
      merchantInfo: {
        intro: "حساب التاجر مخصص للأعمال التي تعيد بيع خدمات GSM.",
        points: [
          "يتواصل معك فريقنا عبر واتساب لفتح حساب التاجر.",
          "أسعار المجموعات ومحفظة مدفوعة مسبقًا وفواتير.",
          "مفاتيح API وwebhooks لربط أدواتك الخاصة.",
        ],
        submit: "قدّم طلبًا كتاجر",
      },
      haveAccount: "لديك حساب بالفعل؟",
    },

    forgot: {
      metaTitle: "إعادة تعيين كلمة المرور",
      title: "إعادة تعيين كلمة المرور",
      subtitle: "أدخل بريدك الإلكتروني وسنرسل إليك رابطًا لاختيار كلمة مرور جديدة.",
      chooseHint: "يعيد العملاء والتجار تعيين كلمة المرور كلٌّ على حدة. اختر نوع حسابك.",
      customerHint: "سجّلت الدخول حتى الآن برابط من البريد؟ استخدم هذا لتعيين أول كلمة مرور لك.",
      submit: "أرسل لي رابط إعادة التعيين",
      sentTitle: "تحقّق من بريدك الإلكتروني",
      sentText:
        "إن كان هناك حساب مرتبط بالبريد {email} فهناك رابط لاختيار كلمة مرور جديدة في طريقه إليه. يعمل الرابط مرة واحدة وتنتهي صلاحيته بعد ساعة.",
    },

    setPassword: {
      metaTitle: "اختيار كلمة مرور",
      title: "اختر كلمة مرور",
      subtitle: "اختر كلمة مرور لحسابك.",
      submit: "احفظ كلمة المرور",
      missingTitle: "تحتاج هذه الصفحة إلى الرابط الوارد في بريدك",
      missingText: "افتح الرابط من بريدك مرة أخرى. وإن لم يعمل فاطلب رابطًا جديدًا.",
      expiredTitle: "انتهت صلاحية هذا الرابط",
      expiredText: "يعمل الرابط مرة واحدة ولمدة ساعة. اطلب رابطًا جديدًا وسنرسله إلى بريدك فورًا.",
      doneTitle: "تم حفظ كلمة المرور",
      doneText: "تم تسجيل خروجك من جميع الأجهزة. سجّل الدخول بكلمة المرور الجديدة.",
    },

    verifyEmail: {
      metaTitle: "تأكيد البريد الإلكتروني",
      title: "أكّد بريدك الإلكتروني",
      customerText: "أكّد عنوان بريدك الإلكتروني لإتمام تسجيل الدخول إلى GSM Store.",
      customerSubmit: "أكّد وسجّل الدخول",
      merchantText: "أكّد عنوان بريدك الإلكتروني لحساب التاجر في GSM Store.",
      merchantSubmit: "تأكيد بريدي الإلكتروني",
      missingTitle: "تحتاج هذه الصفحة إلى الرابط الوارد في بريدك",
      missingText: "افتح الرابط من بريدك مرة أخرى. وإن لم يعمل فسجّل الدخول واطلب رابطًا جديدًا.",
      expiredTitle: "انتهت صلاحية هذا الرابط",
      expiredText: "تعمل روابط التأكيد مرة واحدة ولمدة ساعة. ما زال بإمكانك تسجيل الدخول. تواصل مع الدعم إن احتجت إلى رابط جديد.",
      merchantDoneTitle: "تم تأكيد بريدك الإلكتروني",
      merchantDoneText:
        "يراجع فريقنا كل حساب تاجر جديد قبل أن تتمكن من إرسال الطلبات. سجّل الدخول في أي وقت لمعرفة حالة حسابك.",
    },

    register: {
      metaTitle: "التقديم كتاجر",
      title: "قدّم طلبًا كتاجر",
      subtitle: "حسابات التجار يفتحها فريقنا. راسلنا عبر واتساب وسيُكمل معك أحد أفراد الفريق الخطوات.",
      stepsLabel: "خطوات التقديم",
      steps: [
        "راسلنا عبر واتساب.",
        "أخبرنا باسمك واسم شركتك ودولتك وبريدك الإلكتروني.",
        "يراجع فريقنا طلبك ثم يرسل إليك رابطًا لتعيين كلمة المرور.",
      ],
      chat: "تواصل معنا عبر واتساب",
      opensNewTab: "يفتح واتساب في تبويب جديد",
      numberLabel: "أو راسلنا عبر واتساب على هذا الرقم:",
      message: "مرحبًا، أرغب في فتح حساب تاجر.",
      referralSentence: "رمز الإحالة: {code}.",
      referralNote: "سنضيف رمز الإحالة {code} إلى رسالتك.",
      unavailableText: "حسابات التجار يفتحها فريقنا. تواصل مع الدعم وسنساعدك في فتح حسابك.",
      contactSupport: "تواصل مع الدعم",
      haveAccount: "أنت تاجر بالفعل؟",
    },
  },
});

export type AuthMessages = (typeof auth)["en"];
