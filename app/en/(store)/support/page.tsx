// Contact support (public, in the shop frame): a new-ticket form with Turnstile and three side cards. The page frame
// and the side cards are static; the form needs the signed-in customer's email and `?order=` (cookies and
// searchParams), so it streams behind <Suspense> with a same-size skeleton. A guest has no ticket list: the way back to a
// ticket is the link in its email; a signed-in customer also finds theirs under "My tickets". The page says both.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, CircleHelp, Mail, PackageSearch } from "lucide-react";
import { getCustomer } from "@/lib/api/session";
import { sitePath } from "@/lib/site-path";
import { support } from "@/lib/i18n/messages/support";
import { NewTicketForm } from "@/components/support/new-ticket-form";
import { Container, PageHeader } from "@/components/layout/container";
import { PageTransition } from "@/components/layout/page-transition";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function generateMetadata(): Metadata {
  const t = support;
  return { title: t.metaTitle, robots: { index: false, follow: true } };
}

function FormSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Skeleton className="h-[7.5rem]" />
        <Skeleton className="h-[7.5rem]" />
      </div>
      <Skeleton className="h-[4.5rem]" />
      <Skeleton className="h-[12rem]" />
      <Skeleton className="h-[8.5rem]" />
      <Skeleton className="h-[65px]" />
      <Skeleton className="h-12 w-40" />
    </div>
  );
}

async function TicketFormLoader({ searchParams }: { searchParams: PageProps<"/en/support">["searchParams"] }) {
  const [sp, customer] = await Promise.all([
    searchParams,
    getCustomer().catch(() => null),
  ]);
  const t = support;
  const order = Array.isArray(sp.order) ? sp.order[0] : sp.order;
  return (
    <NewTicketForm
      t={{ form: t.form, sent: t.sent }}
      defaults={{ email: customer?.email ?? "", name: customer?.name ?? "", order: (order ?? "").slice(0, 600), signedIn: Boolean(customer) }}
    />
  );
}

export default function SupportPage({ searchParams }: PageProps<"/en/support">) {
  const t = support;
  const side = [
    { href: sitePath("/help"), icon: <CircleHelp aria-hidden="true" />, ...t.side.help },
    { href: sitePath("/track"), icon: <PackageSearch aria-hidden="true" />, ...t.side.track },
  ];

  return (
    <PageTransition>
      <Container className="py-8 sm:py-12">
        <PageHeader title={t.title} description={t.subtitle} />
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card as="section" aria-labelledby="new-ticket">
            <CardHeader title={<span id="new-ticket">{t.form.title}</span>} />
            <CardBody>
              <Suspense fallback={<FormSkeleton />}>
                <TicketFormLoader searchParams={searchParams} />
              </Suspense>
            </CardBody>
          </Card>

          <aside className="grid gap-4" aria-label={t.side.comeBack.title}>
            {side.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-start gap-4 rounded-card border border-line bg-surface p-5 shadow-card transition-shadow hover:shadow-raised"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-card bg-surface-muted text-ink [&_svg]:size-5">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-subheading text-ink">{item.title}</span>
                  <span className="mt-1 block text-body text-ink-muted">{item.text}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-body font-semibold text-ink underline decoration-1 underline-offset-4 group-hover:decoration-2">
                    {item.action}
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </span>
                </span>
              </Link>
            ))}
            <Card tone="muted" className="p-5">
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-card bg-surface text-ink [&_svg]:size-5">
                  <Mail aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-subheading text-ink">{t.side.comeBack.title}</h2>
                  <p className="mt-1 text-body text-ink-muted">{t.side.comeBack.text}</p>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </Container>
    </PageTransition>
  );
}
