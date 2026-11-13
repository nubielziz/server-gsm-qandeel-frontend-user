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
export type ImeiCheckResult = S.PostStoreV1ImeiCheckResponse;
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
export type Ticket = S.GetStoreV1TicketsByTokenResponse;
export type TicketInput = S.PostStoreV1TicketsBody;
export type TicketCreated = S.PostStoreV1TicketsResponse;
export type TicketMessage = Ticket["messages"][number];
export type StoreMeInput = S.PatchStoreV1MeBody;
export type StoreUploadedFile = S.PostStoreV1FilesResponse;

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
