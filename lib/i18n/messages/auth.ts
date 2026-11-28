// Sign-in, sign-up and the email-link pages. There is one kind of account, so nothing here asks who the visitor is: a rank
// tells a retail account from a merchant, and the pages do not (shop decision 002). Server pages import the namespace and
// pass the strings a Client Component needs as props.

export const auth = {
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
    firstName: "First name",
    lastName: "Last name",
    phone: "Phone number",
    phoneHint: "With your country code, for example +1 202 555 0100.",
    country: "Country",
    countryPlaceholder: "Select your country",
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
    emailLink: "Email me a sign-in link",
    merchantPrices: "Need merchant prices?",
    or: "or",
    noAccount: "New here?",
    createAccount: "Create an account",
    invalidCredentials: "The email or password is incorrect.",
    expired: "Your sign-in expired. Start again.",
    magic: {
      title: "Email me a sign-in link",
      text: "We email you a link that signs you in, so there is no password to type. It works for an account you already have.",
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
    link: {
      title: "You opened a sign-in link",
      text: "Select the button to finish signing in. We ask you to confirm so that an email scanner cannot use the link up before you.",
      submit: "Sign in to IMEI-HUB",
      expiredTitle: "This sign-in link has expired",
      expiredText: "Links work once and last 1 hour. Request a new one and we will email it right away.",
      claim: "Add the orders I placed as a guest with this email",
      claimed: {
        one: "{count} guest order was added to your account.",
        other: "{count} guest orders were added to your account.",
      },
      claimBusy: "Your guest orders could not be added just now. Ask for a new sign-in link later to try again.",
      continue: "Continue",
      signedInAs: "You are signed in as {email}.",
      notYou: "Not you? Sign out",
      signOutFailed: "We could not sign you out. Try again.",
    },
    /** The form of a sign-up link opened in another browser than the one that filled the sign-up form: nothing was applied yet. */
    finish: {
      title: "Finish creating your account",
      text: "Check these details. If they are not yours, change them.",
      submit: "Finish creating account",
      alreadySet: "This account already has a password, so there is nothing left to finish.",
    },
  },

  signUp: {
    metaTitle: "Create account",
    title: "Create your account",
    subtitle: "Buy IMEI checks, unlocks and activations. Pay at checkout and follow every order.",
    form: {
      submit: "Create account",
      sentText:
        "If that address can sign in, a link is on its way to {email}. It works once and expires in 1 hour. Check your spam folder if you do not see it.",
      sentDevice: "Open the link on this device to finish at once. On another device you will be asked to confirm your details.",
    },
    /** What the form says under a field it refused, before or after sending (the server's field errors use the same words). */
    errors: {
      required: "This field is required.",
      name: "Enter 1 to 60 characters.",
      nameTogether: "The first and last name together can have at most 120 characters.",
      email: "Enter a valid email address.",
      phone: "Enter a phone number with 7 to 15 digits. A leading + is allowed.",
      country: "Choose your country from the list.",
      passwordLength: "Use 10 to 128 characters.",
      passwordVariety: "Use at least 5 different characters.",
    },
    haveAccount: "Already have an account?",
    merchantNote: "Merchant accounts are opened by our team.",
    merchantLink: "Become a merchant",
  },

  forgot: {
    metaTitle: "Reset your password",
    title: "Reset your password",
    subtitle: "Enter your email and we will send you a link to choose a new password.",
    hint: "Signed in with an email link so far? Use this to set your first password.",
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
    text: "Confirm your email address for your IMEI-HUB account. This does not sign you in.",
    submit: "Verify my email",
    missingTitle: "This page needs the link from your email",
    missingText: "Open the link in your email again. If it does not work, sign in and ask for a new one.",
    expiredTitle: "This link has expired",
    expiredText: "Verification links work once and last 1 hour. You can still sign in. Contact support if you need a new link.",
    doneTitle: "Your email is verified",
    doneText: "Your address is confirmed. Sign in to continue.",
  },

  becomeMerchant: {
    metaTitle: "Become a merchant",
    title: "Become a merchant",
    subtitle:
      "Merchant accounts are opened by our team. Message us on WhatsApp and a team member will complete the steps with you.",
    stepsLabel: "How to apply",
    steps: [
      "Fill in your details below.",
      "Press the WhatsApp button: your details are already written in the message. Send it.",
      "Our team reviews the request and sends you a link to set your password.",
    ],
    detailsNote: "These details only go into the WhatsApp message. This site does not keep them.",
    chat: "Chat on WhatsApp",
    opensNewTab: "opens WhatsApp in a new tab",
    numberLabel: "Or message this number on WhatsApp:",
    message: "Hello, I would like to open a merchant account.",
    unavailableText: "Merchant accounts are opened by our team. Contact support and we will help you open yours.",
    contactSupport: "Contact support",
    haveAccount: "Already have an account?",
  },
};

export type AuthMessages = typeof auth;
