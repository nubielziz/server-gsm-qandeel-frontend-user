// AuthShell (mockup "Sign-In"): two columns from `lg` up. Left: a light-grey hero panel with the logo, a big headline,
// a subtitle, three feature items and the `sign-in-hero.jpg` image filling the space under them. Right: the white form panel
// (children), centred, max 28rem, Terms / Privacy at the bottom.
// Mobile: the form comes first under a compact brand bar; no hero image.
import Link from "next/link";
import type { ReactNode } from "react";
import { Layers, Store, Zap } from "lucide-react";
import { sitePath } from "@/lib/site-path";
import { common } from "@/lib/i18n/messages/common";
import { ImageSlot } from "@/components/ui/image-slot";
import { ChromeProviders } from "./chrome-providers";
import { Logo } from "./logo";
import { SkipLink } from "./skip-link";

export type AuthShellProps = {
  /** The form content: the page renders its own `h1` and form. */
  children: ReactNode;
};

/** The sign-in / sign-up page frame. Static: no session reads. */
export function AuthShell({ children }: AuthShellProps) {
  const t = common;
  const features = [
    { icon: <Layers aria-hidden="true" />, title: t.auth.featureServicesTitle, text: t.auth.featureServicesText },
    { icon: <Zap aria-hidden="true" />, title: t.auth.featureTrackingTitle, text: t.auth.featureTrackingText },
    { icon: <Store aria-hidden="true" />, title: t.auth.featureProsTitle, text: t.auth.featureProsText },
  ];

  return (
    <ChromeProviders>
      <SkipLink />
      <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-label={t.brand.name} className="relative hidden flex-col overflow-hidden bg-surface-muted lg:flex">
          <div className="relative z-10 flex flex-col gap-12 p-10 pb-0 xl:p-14 xl:pb-0">
            <Logo tagline />
            <div className="max-w-2xl">
              <p className="text-display text-ink">{t.auth.headline}</p>
              <p className="mt-5 max-w-xl text-subheading font-normal text-ink-muted">{t.auth.subtitle}</p>
            </div>
            <ul className="grid max-w-3xl gap-6 xl:grid-cols-3">
              {features.map((feature) => (
                <li key={feature.title} className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-card border border-line bg-surface text-ink shadow-card [&_svg]:size-5">
                    {feature.icon}
                  </span>
                  <span>
                    <span className="block text-subheading text-ink">{feature.title}</span>
                    <span className="mt-0.5 block text-body text-ink-muted">{feature.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {/* The image fills the rest of the panel under the text (never behind it: the scene is dark in the middle),
              anchored to the desk at the bottom and fading into the panel at the top. */}
          <div className="relative mt-8 min-h-64 flex-1">
            <ImageSlot
              file="sign-in-hero.jpg"
              alt=""
              sizes="(min-width: 1024px) 56vw, 0px"
              objectPosition="center bottom"
              priority
            />
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1/3 bg-linear-to-b from-surface-muted to-transparent" />
          </div>
        </section>

        <div className="flex min-h-dvh flex-col lg:min-h-0">
          <div className="flex items-center px-gutter py-3 lg:hidden">
            <Logo />
          </div>
          <main id="main" className="flex flex-1 items-center justify-center px-gutter py-8">
            <div className="w-full max-w-[28rem]">{children}</div>
          </main>
          <footer className="flex flex-wrap items-center justify-center gap-x-4 px-gutter pb-8 text-small text-ink-muted">
            <Link href={sitePath("/pages/terms")} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink">
              {t.auth.terms}
            </Link>
            <span aria-hidden="true" className="h-4 w-px bg-line-strong" />
            <Link href={sitePath("/pages/privacy")} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink">
              {t.auth.privacy}
            </Link>
          </footer>
        </div>
      </div>
    </ChromeProviders>
  );
}
