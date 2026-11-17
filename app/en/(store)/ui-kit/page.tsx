// The design system on one page: every primitive and state, for screenshots and review.
// Development only: a 404 in production, and never indexed.
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Download,
  Inbox,
  Mail,
  Package,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShoppingBag,
  Smartphone,
  Trash2,
  Wallet,
  Headset,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import { Container, PageHeader, Section } from "@/components/layout/container";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, Switch } from "@/components/ui/checkbox";
import { CopyButton } from "@/components/ui/copy-button";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { DialogClose, DialogTrigger, Drawer, Modal } from "@/components/ui/dialog";
import { Divider } from "@/components/ui/divider";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { ImageSlot } from "@/components/ui/image-slot";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Money } from "@/components/ui/money";
import { Pagination } from "@/components/ui/pagination";
import { PasswordInput } from "@/components/ui/password-input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RadioCard, RadioGroup } from "@/components/ui/radio-card";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { sitePath } from "@/lib/site-path";
import { common, statusLabel } from "@/lib/i18n/messages/common";
import { ControlledModalDemo, ToastDemo } from "./demos";

export const metadata: Metadata = { title: "UI kit", robots: { index: false } };

// Sample copy for this page only.
const kit = {
  title: "UI kit",
  description: "Every primitive and state of the GSM design system. Development only.",
  tokens: "Tokens",
  colours: "Colours",
  radii: "Radii and shadows",
  type: "Type scale",
  display: "Display headline",
  titleSample: "Page title",
  heading: "Card heading",
  subheading: "Subheading",
  body: "Body text at fifteen pixels, set for reading in a dense dashboard.",
  small: "Small text for hints and table meta",
  caption: "Caption text",
  buttons: "Buttons",
  sizes: "Sizes",
  withIcons: "With icons, loading and disabled",
  primary: "Primary",
  secondary: "Secondary",
  ghost: "Ghost",
  inverse: "Inverse",
  danger: "Danger",
  link: "Link",
  saving: "Saving",
  disabled: "Disabled",
  forms: "Forms",
  email: "Email address",
  emailHint: "We only use it to send your order updates.",
  emailPlaceholder: "name@example.com",
  password: "Password",
  passwordPlaceholder: "Enter your password",
  fullName: "Full name",
  fieldError: "This field is required.",
  optional: "(optional)",
  message: "Message",
  country: "Country",
  selectCountry: "Select a country",
  countries: { jo: "Jordan", ae: "United Arab Emirates", sa: "Saudi Arabia" },
  terms: "I agree to the terms of service",
  termsHint: "You can read them before you continue.",
  termsError: "You must accept the terms to continue.",
  notifications: "Email notifications",
  notificationsHint: "Order updates and receipts.",
  payment: "Payment method",
  paymentHint: "Choose how you want to pay.",
  wallet: "IMEI-HUB wallet",
  walletText: "Pay using your account balance.",
  card: "Card",
  cardText: "Visa and Mastercard.",
  bank: "Bank transfer",
  bankText: "Confirmed manually within a day.",
  period: "Period",
  week: "Week",
  month: "Month",
  year: "Year",
  searchServices: "Search services",
  search: "Search",
  copyValue: "Copy",
  status: "Status badges",
  cards: "Cards and statistics",
  cardTitle: "Card title",
  cardText2: "A white card with a one pixel light border and a twelve pixel radius.",
  cardAction: "Action",
  cardFooter: "Review your changes before saving.",
  totalOrders: "Total orders",
  allRequests: "All service requests",
  completed: "Completed",
  finished: "Successfully finished",
  balance: "Available balance",
  addFunds: "Add funds",
  transactions: "View transactions",
  invoice: "Invoice preview",
  issueDate: "Issue date",
  relatedOrder: "Related order",
  item: "Item",
  quantity: "Quantity",
  total: "Total",
  tables: "Tables, tabs and pagination",
  orderNo: "Order",
  service: "Service",
  price: "Price",
  statusCol: "Status",
  stackedNote: "Stacked layout (below 768px each row becomes a card)",
  exampleService: "Example service",
  all: "All",
  open: "Open",
  waiting: "Waiting",
  resolved: "Resolved",
  ticketsNav: "Ticket status",
  breadcrumb: "Breadcrumb",
  feedback: "Feedback and states",
  info: "Information",
  infoText: "Prices are shown in your selected currency.",
  success: "Saved",
  successText: "Your changes were saved.",
  warning: "Verification needed",
  warningText: "Confirm your email to unlock all features.",
  dangerTitle: "Payment failed",
  dangerText: "The payment provider did not respond. Try again in a moment.",
  emptyTitle: "No orders yet",
  emptyText: "When you place an order it will appear here.",
  browse: "Browse services",
  errorTitle: "We could not load your orders",
  errorText: "Something went wrong on our side. Please try again.",
  reference: "Reference: 7f3a9c21",
  retry: "Try again",
  loading: "Loading skeletons",
  progress: "Order status summary",
  toasts: "Toasts",
  toastBody: "This message disappears by itself.",
  overlays: "Drawer, modal and menu",
  openDrawer: "Open drawer",
  drawerEyebrow: "Service requirements",
  drawerTitle: "Device check",
  drawerText: "Provide the required device information to continue.",
  imei: "IMEI number",
  imeiPlaceholder: "Enter the 15-digit IMEI",
  model: "Device model",
  selectModel: "Select device model",
  cancel: "Cancel",
  saveContinue: "Save details and continue",
  openModal: "Open modal",
  modalTitle: "Delete this key?",
  modalText: "Applications using it will stop working immediately. This cannot be undone.",
  confirmDelete: "Delete key",
  accountMenu: "Account menu",
  account: "My account",
  orders: "My orders",
  settings: "Settings",
  signOut: "Sign out",
  misc: "Avatar, divider, images and content",
  orContinue: "or continue with",
  imageSlot: "Image slot (the file is not added yet, so this is the placeholder)",
  markdown: "## Terms\n\nBy using the store you agree to these terms.\n\n- Orders are processed in the order they arrive\n- Prices include the taxes shown at checkout\n\nRead more on the [help center](/en/help) or visit [example.com](https://example.com).\n\n| Plan | Price |\n|---|---|\n| Basic | 1.00 |\n| Plus | 2.00 |\n",
};

const swatches = [
  ["page", "bg-page"],
  ["surface", "bg-surface"],
  ["surface-muted", "bg-surface-muted"],
  ["surface-sunken", "bg-surface-sunken"],
  ["inverse", "bg-inverse"],
  ["inverse-raised", "bg-inverse-raised"],
  ["ink", "bg-ink"],
  ["ink-muted", "bg-ink-muted"],
  ["ink-subtle", "bg-ink-subtle"],
  ["line", "bg-line"],
  ["line-strong", "bg-line-strong"],
  ["control", "bg-control"],
  ["success", "bg-success"],
  ["success-soft", "bg-success-soft"],
  ["warning", "bg-warning"],
  ["warning-soft", "bg-warning-soft"],
  ["danger", "bg-danger"],
  ["danger-soft", "bg-danger-soft"],
  ["focus", "bg-focus"],
] as const;

export default function UiKitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const t = common;
  const k = kit;
  const p = (path: string) => sitePath(path);
  const base = p("/ui-kit");

  return (
    <Container className="grid gap-14 py-10">
      <PageHeader
        title={k.title}
        description={k.description}
        eyebrow={<Breadcrumbs label={k.breadcrumb} items={[{ label: t.nav.home, href: p("/") }, { label: k.title }]} />}
        actions={<Badge tone="inverse">EN</Badge>}
      />

      {/* ── Tokens ─────────────────────────────────────────────────────────────────────────────────────── */}
      <Section title={k.tokens} headingId="tokens">
        <Card>
          <CardHeader title={k.colours} titleAs="h3" />
          <CardBody>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {swatches.map(([name, cls]) => (
                <li key={name} className="flex items-center gap-3">
                  <span className={`size-10 shrink-0 rounded-control border border-line ${cls}`} />
                  <span dir="ltr" className="truncate text-small text-ink-muted">
                    {name}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={k.radii} titleAs="h3" />
            <CardBody className="flex flex-wrap items-center gap-4">
              <span className="grid size-16 place-items-center rounded-badge bg-surface-sunken text-caption">6</span>
              <span className="grid size-16 place-items-center rounded-control bg-surface-sunken text-caption">10</span>
              <span className="grid size-16 place-items-center rounded-card bg-surface-sunken text-caption">12</span>
              <span className="grid size-16 place-items-center rounded-panel bg-surface-sunken text-caption">16</span>
              <span className="grid size-16 place-items-center rounded-card bg-surface text-caption shadow-card">card</span>
              <span className="grid size-16 place-items-center rounded-card bg-surface text-caption shadow-raised">raised</span>
              <span className="grid size-16 place-items-center rounded-card bg-surface text-caption shadow-overlay">overlay</span>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={k.type} titleAs="h3" />
            <CardBody className="grid gap-3">
              <p className="text-display">{k.display}</p>
              <p className="text-title">{k.titleSample}</p>
              <p className="text-heading">{k.heading}</p>
              <p className="text-subheading">{k.subheading}</p>
              <p className="text-body">{k.body}</p>
              <p className="text-small text-ink-muted">{k.small}</p>
              <p className="text-caption text-ink-subtle">{k.caption}</p>
              <p className="text-stat num">1,284.50</p>
            </CardBody>
          </Card>
        </div>
      </Section>

      {/* ── Buttons ───────────────────────────────────────────────────────────────────────────────────── */}
      <Section title={k.buttons} headingId="buttons">
        <Card>
          <CardBody className="grid gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button>{k.primary}</Button>
              <Button variant="secondary">{k.secondary}</Button>
              <Button variant="ghost">{k.ghost}</Button>
              <Button variant="danger">{k.danger}</Button>
              <Button variant="link">{k.link}</Button>
              <ButtonLink href={p("/services")} variant="secondary" endIcon={<ArrowRight aria-hidden="true" />}>
                {t.actions.browseServices}
              </ButtonLink>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-small text-ink-subtle">{k.sizes}</span>
              <Button size="sm">sm</Button>
              <Button size="md">md</Button>
              <Button size="lg">lg</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-small text-ink-subtle">{k.withIcons}</span>
              <Button startIcon={<Plus aria-hidden="true" />}>{t.actions.add}</Button>
              <Button variant="secondary" startIcon={<Download aria-hidden="true" />}>
                {t.actions.download}
              </Button>
              <Button loading>{k.saving}</Button>
              <Button disabled>{k.disabled}</Button>
              <IconButton label={t.actions.search} variant="secondary">
                <Search aria-hidden="true" />
              </IconButton>
              <IconButton label={t.actions.delete} variant="ghost" size="sm">
                <Trash2 aria-hidden="true" />
              </IconButton>
              <IconButton label={t.actions.add} variant="primary">
                <Plus aria-hidden="true" />
              </IconButton>
              <Spinner size={20} label={t.ui.loading} />
            </div>
            <div className="surface-inverse flex flex-wrap items-center gap-3 rounded-card p-5">
              <Button variant="inverse">{k.inverse}</Button>
              <Button variant="inverse" startIcon={<Wallet aria-hidden="true" />}>
                {k.addFunds}
              </Button>
            </div>
          </CardBody>
        </Card>
      </Section>

      {/* ── Forms ─────────────────────────────────────────────────────────────────────────────────────── */}
      <Section title={k.forms} headingId="forms">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardBody className="grid gap-5">
              <Input
                label={k.email}
                type="email"
                leading={<Mail aria-hidden="true" />}
                placeholder={k.emailPlaceholder}
                hint={k.emailHint}
                autoComplete="email"
              />
              <PasswordInput label={k.password} placeholder={k.passwordPlaceholder} leading={<UserRound aria-hidden="true" />} />
              <Input label={k.fullName} required error={k.fieldError} defaultValue="" />
              <Input label={k.fullName} optionalLabel={k.optional} defaultValue="Alex" />
              <Input label={k.fullName} disabled defaultValue="Alex" />
              <Textarea label={k.message} />
              <Select
                label={k.country}
                placeholder={k.selectCountry}
                options={[
                  { value: "jo", label: k.countries.jo },
                  { value: "ae", label: k.countries.ae },
                  { value: "sa", label: k.countries.sa },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="grid gap-5">
              <Checkbox label={k.terms} description={k.termsHint} />
              <Checkbox label={k.terms} error={k.termsError} />
              <Switch label={k.notifications} description={k.notificationsHint} defaultChecked />
              <RadioGroup legend={k.payment} hint={k.paymentHint} columns={1}>
                <RadioCard name="pay" value="wallet" tone="inverse" icon={<Wallet aria-hidden="true" />} title={k.wallet} description={k.walletText} defaultChecked>
                  <span className="grid gap-1 text-small text-on-inverse-muted">
                    <span className="flex justify-between">
                      <span>{k.balance}</span>
                      <Money amount="245.0000" currency="USD" className="font-bold text-on-inverse" />
                    </span>
                  </span>
                </RadioCard>
                <RadioCard name="pay" value="card" icon={<ShoppingBag aria-hidden="true" />} title={k.card} description={k.cardText} />
                <RadioCard name="pay" value="bank" icon={<ReceiptText aria-hidden="true" />} title={k.bank} description={k.bankText} />
              </RadioGroup>
              <div className="flex flex-wrap items-center gap-4">
                <SegmentedControl
                  label={k.period}
                  defaultValue="month"
                  options={[
                    { value: "week", label: k.week },
                    { value: "month", label: k.month },
                    { value: "year", label: k.year },
                  ]}
                />
                <CopyButton value="gsm_demo_key_0000" label={k.copyValue} />
              </div>
              <SearchInput action={p("/ui-kit")} label={k.searchServices} placeholder={k.searchServices} submitLabel={k.search} />
            </CardBody>
          </Card>
        </div>
      </Section>

      {/* ── Badges ────────────────────────────────────────────────────────────────────────────────────── */}
      <Section title={k.status} headingId="badges">
        <Card>
          <CardBody className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {(["pending", "processing", "completed", "rejected"] as const).map((s) => (
                <StatusBadge key={s} kind="order" status={s} label={statusLabel(t, "order", s)} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["open", "paid", "void"] as const).map((s) => (
                <StatusBadge key={s} kind="invoice" status={s} label={statusLabel(t, "invoice", s)} />
              ))}
              {(["new", "open", "pending", "resolved"] as const).map((s) => (
                <StatusBadge key={s} kind="ticket" status={s} label={statusLabel(t, "ticket", s)} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["none", "pending", "approved", "rejected"] as const).map((s) => (
                <StatusBadge key={s} kind="kyc" status={s} label={statusLabel(t, "kyc", s)} />
              ))}
              {(["verified", "unverified"] as const).map((s) => (
                <StatusBadge key={s} kind="verification" status={s} label={statusLabel(t, "verification", s)} />
              ))}
              {(["active", "suspended"] as const).map((s) => (
                <StatusBadge key={s} kind="account" status={s} label={statusLabel(t, "account", s)} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="outline" shape="tag">
                {t.serviceType.imei}
              </Badge>
              <Badge tone="neutral" shape="tag">
                {t.serviceType.server}
              </Badge>
              <Badge tone="inverse" shape="tag">
                {t.serviceType.remote}
              </Badge>
              <Badge tone="neutral" shape="tag" icon={<Smartphone aria-hidden="true" />}>
                {t.serviceType.file}
              </Badge>
            </div>
          </CardBody>
        </Card>
      </Section>

      {/* ── Cards and statistics ──────────────────────────────────────────────────────────────────────── */}
      <Section title={k.cards} headingId="cards">
        <div className="grid gap-4 lg:grid-cols-3">
          <StatCard tone="inverse" label={k.balance} value={<Money amount="245.0000" currency="USD" />} icon={<Wallet aria-hidden="true" />} className="lg:col-span-1">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="inverse">{k.addFunds}</Button>
              <Button variant="link" className="text-on-inverse">
                {k.transactions}
              </Button>
            </div>
          </StatCard>
          <StatCard label={k.totalOrders} value="142" hint={k.allRequests} icon={<Package aria-hidden="true" />} />
          <StatCard label={k.completed} value="126" hint={k.finished} icon={<Inbox aria-hidden="true" />} href={p("/ui-kit")} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={k.cardTitle} description={k.cardText2} actions={<Button size="sm" variant="secondary">{k.cardAction}</Button>} divided />
            <CardBody>
              <ProgressBar
                label={k.progress}
                segments={[
                  { value: 126, tone: "success" },
                  { value: 8, tone: "warning" },
                  { value: 7, tone: "neutral" },
                  { value: 1, tone: "danger" },
                ]}
              />
            </CardBody>
            <CardFooter>
              <p className="text-small text-ink-muted">{k.cardFooter}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary">
                  {t.actions.cancel}
                </Button>
                <Button size="sm">{t.actions.saveChanges}</Button>
              </div>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader title={k.invoice} titleAs="h3" actions={<StatusBadge kind="invoice" status="open" label={statusLabel(t, "invoice", "open")} />} />
            <CardBody>
              <DescriptionList>
                <DescriptionItem label={k.issueDate}>Nov 03, 2026</DescriptionItem>
                <DescriptionItem label={k.relatedOrder}>#GS1283</DescriptionItem>
                <DescriptionItem label={k.item}>{k.exampleService}</DescriptionItem>
                <DescriptionItem label={k.quantity}>1</DescriptionItem>
              </DescriptionList>
              <DescriptionList flush className="mt-3">
                <DescriptionItem label={k.total} emphasis>
                  <Money amount="39.0000" currency="USD" />
                </DescriptionItem>
              </DescriptionList>
            </CardBody>
          </Card>
        </div>
      </Section>

      {/* ── Tables, tabs, pagination ──────────────────────────────────────────────────────────────────── */}
      <Section title={k.tables} headingId="tables">
        <Card>
          <CardHeader title={k.orderNo} titleAs="h3" />
          <div className="px-5 pt-3 sm:px-6">
            <Tabs
              label={k.ticketsNav}
              activeKey="all"
              items={[
                { key: "all", label: k.all, href: base },
                { key: "open", label: k.open, href: `${base}?status=open`, count: 3 },
                { key: "waiting", label: k.waiting, href: `${base}?status=waiting` },
                { key: "resolved", label: k.resolved, href: `${base}?status=resolved` },
              ]}
            />
          </div>
          <CardBody flush>
            <Table caption={k.orderNo}>
              <TableHead>
                <TableRow className="border-0">
                  <TableHeaderCell>{k.orderNo}</TableHeaderCell>
                  <TableHeaderCell>{k.service}</TableHeaderCell>
                  <TableHeaderCell numeric>{k.price}</TableHeaderCell>
                  <TableHeaderCell>{k.statusCol}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(
                  [
                    ["#GS1284", "1.2500", "completed"],
                    ["#GS1283", "39.0000", "processing"],
                    ["#GS1282", "10.0000", "pending"],
                    ["#GS1281", "8.0000", "rejected"],
                  ] as const
                ).map(([no, amount, status]) => (
                  <TableRow key={no}>
                    <TableCell className="font-semibold">
                      <span dir="ltr">{no}</span>
                    </TableCell>
                    <TableCell>{k.exampleService}</TableCell>
                    <TableCell numeric>
                      <Money amount={amount} currency="USD" />
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="order" status={status} label={statusLabel(t, "order", status)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
          <CardFooter>
            <Pagination total={240} pageSize={20} page={3} basePath={base} searchParams={{ status: "open" }} className="w-full" />
          </CardFooter>
        </Card>
        <Card>
          <CardHeader title={k.stackedNote} titleAs="h3" />
          <CardBody flush>
            <Table stacked caption={k.stackedNote}>
              <TableHead>
                <TableRow className="border-0">
                  <TableHeaderCell>{k.orderNo}</TableHeaderCell>
                  <TableHeaderCell>{k.service}</TableHeaderCell>
                  <TableHeaderCell numeric>{k.price}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(["#GS1284", "#GS1283"] as const).map((no) => (
                  <TableRow key={no}>
                    <TableCell label={k.orderNo} className="font-semibold">
                      <span dir="ltr">{no}</span>
                    </TableCell>
                    <TableCell label={k.service}>{k.exampleService}</TableCell>
                    <TableCell label={k.price} numeric>
                      <Money amount="12.4900" currency="USD" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
        <Tabs
          label={k.ticketsNav}
          variant="pill"
          activeKey="open"
          items={[
            { key: "all", label: k.all, href: base },
            { key: "open", label: k.open, href: `${base}?status=open`, count: 3 },
            { key: "resolved", label: k.resolved, href: `${base}?status=resolved` },
          ]}
        />
      </Section>

      {/* ── Feedback ──────────────────────────────────────────────────────────────────────────────────── */}
      <Section title={k.feedback} headingId="feedback">
        <div className="grid gap-3 lg:grid-cols-2">
          <Alert tone="info" title={k.info}>
            {k.infoText}
          </Alert>
          <Alert tone="success" title={k.success}>
            {k.successText}
          </Alert>
          <Alert tone="warning" title={k.warning} action={<Button size="sm" variant="secondary">{t.actions.continue}</Button>}>
            {k.warningText}
          </Alert>
          <Alert tone="danger" title={k.dangerTitle}>
            {k.dangerText}
          </Alert>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <EmptyState
              icon={<Inbox aria-hidden="true" />}
              title={k.emptyTitle}
              description={k.emptyText}
              action={<ButtonLink href={p("/services")}>{k.browse}</ButtonLink>}
            />
          </Card>
          <Card>
            <ErrorState
              title={k.errorTitle}
              message={k.errorText}
              reference={k.reference}
              action={<Button variant="secondary">{k.retry}</Button>}
            />
          </Card>
        </div>
        <Card>
          <CardHeader title={k.loading} titleAs="h3" />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 shrink-0 rounded-card" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            </div>
            <SkeletonText lines={3} />
            <Skeleton className="h-11 w-32 rounded-control" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={k.toasts} titleAs="h3" />
          <CardBody>
            <ToastDemo labels={{ success: k.success, error: k.dangerTitle, info: k.info, warning: k.warning, body: k.toastBody }} />
          </CardBody>
        </Card>
      </Section>

      {/* ── Overlays ──────────────────────────────────────────────────────────────────────────────────── */}
      <Section title={k.overlays} headingId="overlays">
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3">
            <DialogTrigger for="kit-drawer" variant="primary">
              {k.openDrawer}
            </DialogTrigger>
            <DialogTrigger for="kit-modal" variant="secondary">
              {k.openModal}
            </DialogTrigger>
            <ControlledModalDemo
              open={`${k.openModal} (controlled)`}
              title={k.modalTitle}
              text={k.modalText}
              confirm={k.confirmDelete}
              cancel={k.cancel}
            />
            <Menu label={k.accountMenu} chevron trigger={<><Avatar name="Alex Morgan" /><span className="text-small font-bold">Alex Morgan</span></>}>
              <MenuLabel>
                <p className="text-body font-bold">Alex Morgan</p>
                <p className="text-small text-ink-subtle">alex@example.com</p>
              </MenuLabel>
              <MenuSeparator />
              <MenuItem href={p("/ui-kit")} icon={<UserRound aria-hidden="true" />}>
                {k.account}
              </MenuItem>
              <MenuItem href={p("/ui-kit")} icon={<ReceiptText aria-hidden="true" />}>
                {k.orders}
              </MenuItem>
              <MenuItem href={p("/ui-kit")} icon={<Settings aria-hidden="true" />}>
                {k.settings}
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Headset aria-hidden="true" />}>{t.nav.support}</MenuItem>
            </Menu>
          </CardBody>
        </Card>

        <Drawer
          id="kit-drawer"
          eyebrow={k.drawerEyebrow}
          title={k.drawerTitle}
          description={k.drawerText}
          footer={
            <>
              <DialogClose>{k.cancel}</DialogClose>
              <Button type="submit" form="kit-drawer-form">
                {k.saveContinue}
              </Button>
            </>
          }
        >
          <form id="kit-drawer-form" method="dialog" className="grid gap-5">
            <Input label={k.imei} required placeholder={k.imeiPlaceholder} inputMode="numeric" />
            <Select
              label={k.model}
              required
              placeholder={k.selectModel}
              options={[
                { value: "a", label: `${k.exampleService} A` },
                { value: "b", label: `${k.exampleService} B` },
              ]}
            />
            <Alert tone="info">{k.infoText}</Alert>
          </form>
        </Drawer>
        <Modal
          id="kit-modal"
          size="sm"
          title={k.modalTitle}
          footer={
            <>
              <DialogClose>{k.cancel}</DialogClose>
              <Button variant="danger">{k.confirmDelete}</Button>
            </>
          }
        >
          <p className="text-body text-ink-muted">{k.modalText}</p>
        </Modal>
      </Section>

      {/* ── Misc ──────────────────────────────────────────────────────────────────────────────────────── */}
      <Section title={k.misc} headingId="misc">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardBody className="grid gap-5">
              <div className="flex items-center gap-3">
                <Avatar name="Alex Morgan" size="sm" />
                <Avatar name="Alex Morgan" size="md" />
                <Avatar name="Alex Morgan" size="lg" />
                {/* A customer's name typed in Arabic script (user text): the initial is its first letter. */}
                <Avatar name={"\u0633\u0627\u0631\u0629 \u0623\u062d\u0645\u062f"} size="lg" />
                <VisuallyHidden>Avatar examples</VisuallyHidden>
              </div>
              <Divider label={k.orContinue} />
              <p className="text-small text-ink-subtle">{k.imageSlot}</p>
              <ImageSlot file="home-promo.jpg" alt="" aspect="4 / 3" sizes="(min-width: 1024px) 40vw, 100vw" className="rounded-card" />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <Markdown source={k.markdown} />
            </CardBody>
          </Card>
        </div>
      </Section>
    </Container>
  );
}
