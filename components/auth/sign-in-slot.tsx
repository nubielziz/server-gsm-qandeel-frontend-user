// SignInSlot: the sign-in flow with the countries its "finish your account" form offers (a sign-up link opened in another browser
// asks the person to confirm the details, country included). The menu is the shop's tax-rate countries when it has any, else
// every country (`readShopCountries`); the sign-in page puts this behind <Suspense> with a same-size skeleton, so the rest of the
// page stays static. A config that cannot be read never stops the sign-in: the full list is offered then.
import { auth } from "@/lib/i18n/messages/auth";
import { SignInFlow } from "./sign-in-flow";
import { readShopCountries } from "./shop-countries";

export async function SignInSlot() {
  const countries = await readShopCountries();
  return <SignInFlow countries={countries} t={{ fields: auth.fields, shared: auth.shared, signIn: auth.signIn, signUp: { errors: auth.signUp.errors } }} />;
}
