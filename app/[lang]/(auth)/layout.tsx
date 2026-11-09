// Sign-in, sign-up and email-link pages: the two-column AuthShell (hero panel + form panel). It renders `<main id="main">`.
import { AuthShell } from "@/components/layout/auth-shell";

export default function AuthLayout({ children }: LayoutProps<"/[lang]">) {
  return <AuthShell>{children}</AuthShell>;
}
