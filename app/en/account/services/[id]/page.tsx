// The old address of a merchant rank's order form (`/account/services/<id>`), kept for links and bookmarks. There is no price
// list any more (decision 003): an account of a merchant rank orders at the same checkout address as every buyer, where its own
// order form opens. So this page only sends the reader on: to the checkout of the service when the service has a shop page, else
// to the shop's services (a service without a shop page cannot be ordered on the website until it is published). The
// lookup is the cached public catalog (`slugForService`): nothing personal is read here. It streams (the params are read
// behind <Suspense>), so the redirect is an instant one inside the answer, which is never indexed.
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageTransition } from "@/components/layout/page-transition";
import { slugForService } from "@/lib/catalog";
import { checkoutHref } from "@/lib/checkout/access";
import { sitePath } from "@/lib/site-path";

const ID_PATTERN = /^[1-9]\d{0,15}$/;

export function generateMetadata(): Metadata {
  return { robots: { index: false, follow: false } };
}

/** `/account/services/<id>`: sends the reader to the service's checkout, or to the shop's services. */
export default function OldOrderFormPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageTransition>
      <Suspense fallback={null}>
        <OldOrderFormRedirect params={params} />
      </Suspense>
    </PageTransition>
  );
}

/**
 * Where an old order form address leads: the checkout address of the service's shop page (a temporary redirect: a service can be
 * published or withdrawn), or the shop's services for an id that is malformed or has no shop page.
 */
async function OldOrderFormRedirect({ params }: { params: Promise<{ id: string }> }): Promise<never> {
  const { id } = await params;
  const slug = ID_PATTERN.test(id) ? await slugForService(Number(id)) : null;
  redirect(slug ? checkoutHref(slug) : sitePath("/services"));
}
