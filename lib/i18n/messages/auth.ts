// Sign-in, sign-up and the email-link pages (customer and merchant). Server pages import the namespace
// and pass the strings a Client Component needs as props.

export const auth = {
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
      text: "Open your authenticator app and enter the 6-digit code for your IMEI-HUB account.",
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
      submit: "Sign in to IMEI-HUB",
      expiredTitle: "This sign-in link has expired",
      expiredText: "Links work once and last 1 hour. Request a new one and we will email it right away.",
    },
  },

  signUp: {
    metaTitle: "Create account",
    title: "Create your account",
    subtitle: "Choose how you will use IMEI-HUB.",
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
        "API keys to connect Dhru-compatible tools.",
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
    customerText: "Confirm your email address to finish signing in to IMEI-HUB.",
    customerSubmit: "Confirm and sign in",
    merchantText: "Confirm your email address for your IMEI-HUB merchant account.",
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
    unavailableText: "Merchant accounts are opened by our team. Contact support and we will help you open yours.",
    contactSupport: "Contact support",
    haveAccount: "Already a merchant?",
  },
};

export type AuthMessages = typeof auth;
