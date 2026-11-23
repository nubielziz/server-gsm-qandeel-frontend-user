// Friendly names for the generated API types (lib/api/schema.gen.ts). Import types from here in app code.
// Safe to import anywhere (types only).
import type * as S from "./schema.gen";

export type { Id, Money, Decimal, IsoDateTime, ApiRoutes } from "./schema.gen";

// ── Store (customers, /store/v1)
export type StoreConfig = S.GetStoreV1ConfigResponse;
export type StoreCurrency = StoreConfig["currencies"][number];
export type StorePaymentMethod = StoreConfig["paymentMethods"][number];
export type StoreServiceCard = S.GetStoreV1ServicesResponse[number];
export type StoreServiceDetail = S.GetStoreV1ServicesBySlugResponse;
export type StoreServicesQuery = S.GetStoreV1ServicesQuery;
/** One category of `GET /store/v1/categories` (`serviceCount` is not narrowed by any other filter). */
export type StoreCategory = S.GetStoreV1CategoriesResponse["categories"][number];
export type StorePage = S.GetStoreV1PagesBySlugResponse;
/** One row of `GET /store/v1/pages` (no body): what the sitemap and page lists need. */
export type StorePageListItem = S.GetStoreV1PagesResponse[number];
/** `in_stock` (the smallest order is delivered at once) or `on_request`. Never a count. */
export type ServiceAvailability = StoreServiceCard["availability"];
/** `quantity` of a service page: `{ min, max, options }`; `options` are fixed packs, empty = any number from min to max. */
export type StoreQuantityRule = StoreServiceDetail["quantity"];
export type HelpArticle = S.GetStoreV1HelpResponse[number];
export type HelpArticleDetail = S.GetStoreV1HelpBySlugResponse;
/** What kind of old address `GET /store/v1/legacy-slugs/:kind/:slug` looks up: a service, a content page or a help article. */
export type LegacySlugKind = S.GetStoreV1LegacySlugsByKindBySlugParams["kind"];
/**
 * An address retired by English only (decision 039): `path` is where the reader goes now (no language prefix:
 * `/services/<slug>`, `/services`, `/` or `/help`); `slug` is the service's page on sale now, else null.
 */
export type LegacySlug = S.GetStoreV1LegacySlugsByKindBySlugResponse;
export type CheckoutSession = S.GetStoreV1CheckoutSessionsByTokenResponse;
export type CheckoutSessionInput = S.PostStoreV1CheckoutSessionsBody;
export type ConsentsInput = S.PostStoreV1CheckoutSessionsByTokenConsentsBody;
export type ConsentsResult = S.PostStoreV1CheckoutSessionsByTokenConsentsResponse;
export type PayInput = S.PostStoreV1CheckoutSessionsByTokenPayBody;
export type PayResult = S.PostStoreV1CheckoutSessionsByTokenPayResponse;
export type TrackedOrder = S.GetStoreV1OrdersByTokenResponse;
export type StoreMe = S.GetStoreV1MeResponse;
export type StoreLoginResult = S.PostStoreV1AuthLoginResponse;
export type CustomerOrder = S.GetStoreV1MeOrdersResponse[number];
export type DataRequest = S.PostStoreV1MeDataExportResponse;
export type TicketInput = S.PostStoreV1TicketsBody;
export type TicketCreated = S.PostStoreV1TicketsResponse;
export type StoreMeInput = S.PatchStoreV1MeBody;
export type StoreUploadedFile = S.PostStoreV1FilesResponse;

// ── Support live chat (feature 28). HAND-TYPED from the backend plan `docs/briefs/28-support-live-chat.md` §3.2: the
// generated `schema.gen.ts` does not carry these routes and keys until the backend is merged and `npm run gen:api` runs.
// The new keys of the existing answers are optional here, as in the plan ("always sent; optional in the schema until the
// console merge"): the code reads them with a default, so it works against both. After `gen:api`, the generated types
// carry the same keys and the intersections below become redundant; replace them by plain aliases then.
/** A file on a message: PDF, JPEG or PNG, at most 5 MiB. Download only through the ticket's file route, never inline. */
export type Attachment = { id: S.Id; filename: string; mime: string; size: number };
type StoreTicketBase = S.GetStoreV1TicketsByTokenResponse;
/** A public message of a ticket: `from` is `you` (the requester) or `support`; never an internal note. */
export type TicketMessage = StoreTicketBase["messages"][number] & { attachments?: Attachment[] };
/** `GET /store/v1/tickets/:token`. `seenByYou` / `seenBySupport` are the highest message id each side has seen. */
export type Ticket = Omit<StoreTicketBase, "messages"> & {
  messages: TicketMessage[];
  seenByYou?: S.Id | null;
  seenBySupport?: S.Id | null;
  seenBySupportAt?: S.IsoDateTime | null;
};
/** One row of `GET /store/v1/me/tickets`: the token opens the existing ticket page. */
export type MyTicketRow = {
  number: string;
  subject: string;
  category: Ticket["category"];
  status: Ticket["status"];
  orderId: S.Id | null;
  createdAt: S.IsoDateTime;
  updatedAt: S.IsoDateTime;
  lastMessageAt: S.IsoDateTime | null;
  lastMessageFrom: "you" | "support" | null;
  hasUnread: boolean;
  token: string;
};
/** `POST /store/v1/me/tickets`: the opened ticket with its token. */
export type MyTicketCreated = Ticket & { token: string };
/** One row of `GET /client/tickets` (a merchant's ticket has no token: the id is the address). */
export type ClientTicketRow = Omit<MyTicketRow, "token"> & { id: S.Id };
/** `GET /client/tickets/:id`, `POST /client/tickets`: no rating (customers only). */
export type ClientTicket = Omit<Ticket, "canRate" | "csatScore"> & { id: S.Id };
/** The answer of a ticket file upload (`POST /store/v1/tickets/:token/files`, `POST /client/files`). */
export type TicketFile = { id: S.Id; filename: string; size: number; mime: string };
/** `POST /store/v1/me/tickets` and `POST /client/tickets`. */
export type SignedInTicketInput = {
  subject: string;
  message: string;
  category?: Ticket["category"];
  orderId?: S.Id;
  fileIds?: S.Id[];
};

// ── Store search (feature 29, decision 038): `/store/v1/search/suggest` and `/store/v1/search`. English only; no price is ever
// read from the search engine (the API joins the card price itself). `engine: 'fallback'` = the database answered (degraded: no
// facets, no completions).
/** `GET /store/v1/search/suggest?q=&currency=`: completions, the nearest services, ready filters. Empty `q`: only `popular`. */
export type SuggestBody = S.GetStoreV1SearchSuggestResponse;
/** Which side answered a search: the search engine, or the database fallback. */
export type SearchEngineName = SuggestBody["engine"];
/** A phrase that completes or corrects the typed text (normalised: lower case, single spaces). */
export type SuggestCompletion = SuggestBody["completions"][number];
/** Where a completion phrase comes from. */
export type SuggestCompletionKind = SuggestCompletion["kind"];
/** A service of the suggestion list: its card's display part and the card price without tax, in the asked currency. */
export type SuggestService = SuggestBody["services"][number];
/** A ready filter: `value` is what the list filters by (brand or carrier name, ISO country code, category id). */
export type SuggestFilter = SuggestBody["filters"][number];
/** `GET /store/v1/search`: the results page. `hits` are the exact cards of `GET /store/v1/services`. */
export type SearchBody = S.GetStoreV1SearchResponse;
/** Facet counts of a results page (each group ignores its own selection); null on fallback. */
export type SearchFacets = NonNullable<SearchBody["facets"]>;
/** One facet value with how many matches it would leave. Brand and carrier values are display labels. */
export type SearchFacetCount = SearchFacets["brand"][number];

// ── Store: customer wallet (`/store/v1/me/wallet*`, always USD)
export type CustomerWallet = S.GetStoreV1MeWalletResponse;
export type CustomerStatementLine = S.GetStoreV1MeWalletStatementResponse[number];
export type TopUpMethod = S.GetStoreV1MeWalletTopUpMethodsResponse[number];
export type TopUp = S.GetStoreV1MeWalletTopUpsResponse[number];
/** A top-up with `instructions` (manual) or `paymentUrl` (automatic) while it awaits payment. */
export type TopUpDetail = S.GetStoreV1MeWalletTopUpsByIdResponse;
export type TopUpStatus = TopUp["status"];
export type BalancePaymentResult = S.PostStoreV1CheckoutSessionsByTokenBalancePaymentResponse;

// ── Store: notification center (`/store/v1/me/notifications*`)
export type NotificationItem = S.GetStoreV1MeNotificationsResponse[number];
export type NotificationCategory = NotificationItem["category"];
/** `{ unread }`, capped at 100: show "99+" when it is 100. */
export type UnreadCount = S.GetStoreV1MeNotificationsUnreadCountResponse;

// ── Merchant (/client)
export type MerchantMe = S.GetClientAuthMeResponse;
export type MerchantLoginResult = S.PostClientAuthLoginResponse;
/** `POST /client/auth/sign-in`: the smart sign-in. `kind` names the area, `next` the step still to do. */
export type SmartSignInInput = S.PostClientAuthSignInBody;
export type SmartSignInResult = S.PostClientAuthSignInResponse;
export type MerchantPasswordChangeResult = S.PostClientAuthPasswordChangeResponse;
export type MerchantProfileInput = S.PatchClientProfileBody;
export type MerchantDashboard = S.GetClientDashboardResponse;
export type MerchantOrder = S.GetClientOrdersResponse[number];
export type MerchantOrderDetail = S.GetClientOrdersByIdResponse;
export type MerchantOrderInput = S.PostClientOrdersBody;
export type MerchantService = S.GetClientServicesResponse[number];
export type MerchantServiceDetail = S.GetClientServicesByIdResponse;
export type MerchantWallet = S.GetClientWalletResponse;
export type StatementLine = S.GetClientWalletStatementResponse[number];
export type PaymentMethod = S.GetClientPaymentMethodsResponse[number];
export type Invoice = S.GetClientInvoicesResponse[number];
export type InvoiceDetail = S.GetClientInvoicesByIdResponse;
export type InvoiceCreated = S.PostClientInvoicesResponse;
export type ApiKey = S.GetClientApiKeysResponse[number];
export type ApiKeyCreated = S.PostClientApiKeysResponse;
export type Webhook = S.GetClientWebhooksResponse[number];
export type WebhookCreated = S.PostClientWebhooksResponse;
export type WebhookDelivery = S.GetClientWebhooksByIdDeliveriesResponse[number];
export type NotificationPreferences = S.GetClientNotificationPreferencesResponse;
export type KycView = S.GetClientKycResponse;
export type Referrals = S.GetClientReferralsResponse;
export type Commission = S.GetClientCommissionsResponse[number];
export type MerchantSession = S.GetClientSessionsResponse[number];
export type TwoFactorSetup = S.PostClientSecurity2faSetupResponse;
export type UploadedFile = S.PostClientFilesResponse;

/** Order states shared by merchant and customer orders. */
export type OrderStatus = MerchantOrder["status"];
/** Service delivery types. */
export type ServiceType = StoreServiceCard["type"];
