// The Support pages of the account area (`/account/support`): the list, a new ticket, and the live thread of one ticket by id.
// Every account has the same list and the same form (decision 002); the thread by id is a merchant rank's (a retail
// account reads each of its tickets on the token page, whose texts are in `messages/support.ts` with the list and form texts).

export const supportPages = {
  list: {
    metaTitle: "Support",
    title: "Support",
    subtitle: "Your conversations with our support team. Replies appear here as they are written.",
  },
  newTicket: {
    metaTitle: "New ticket",
    title: "New ticket",
    subtitle: "Tell us what happened. Our team answers in the conversation, and we email you if you miss a reply.",
  },
  thread: {
    metaTitle: "Support ticket",
    notFoundTitle: "We could not find this ticket",
    notFoundText: "It may belong to another account, or the link is incomplete.",
    backToList: "Back to support",
  },
};

export type SupportPagesMessages = typeof supportPages;
