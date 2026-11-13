// A quick view link opened directly (new tab, refresh, shared link): the service page itself, not indexed, with the
// service page as its canonical URL. Inside the shop the same link opens the dialog instead (../../@modal).
import type { Metadata } from "next";
import ServicePage, { generateMetadata as serviceMetadata } from "../../services/[slug]/page";

export async function generateMetadata(props: PageProps<"/[lang]/quick-view/[slug]">): Promise<Metadata> {
  return { ...(await serviceMetadata(props)), robots: { index: false, follow: true } };
}

export default ServicePage;
