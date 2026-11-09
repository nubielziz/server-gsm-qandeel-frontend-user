// `generateStaticParams` under Cache Components must return at least one result (it is what lets Next validate the route at
// build time). When the catalog or help center is empty (an unlisted language) or the API is unreachable at build time,
// a placeholder slug stands in: it renders the normal "not found" page and every real slug is still rendered on demand.
export function staticSlugParams(slugs: string[]): { slug: string }[] {
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "-" }];
}
