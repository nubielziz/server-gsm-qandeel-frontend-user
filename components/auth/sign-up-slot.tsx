// SignUpSlot: the sign-up form with the countries the shop sells to. The menu is the list of the shop's tax-rate countries when it
// has any, else every country (`readShopCountries`: the shop's cached config, shared data, never personal); the sign-up page puts
// this behind <Suspense> with a same-size skeleton, so the rest of the page stays static.
import { auth } from "@/lib/i18n/messages/auth";
import { SignUpForm } from "./sign-up-form";
import { readShopCountries } from "./shop-countries";

export async function SignUpSlot() {
  const countries = await readShopCountries();
  return (
    <SignUpForm
      countries={countries}
      t={{
        fields: auth.fields,
        shared: {
          securityCheckWait: auth.shared.securityCheckWait,
          checkEmailTitle: auth.shared.checkEmailTitle,
          useDifferentEmail: auth.shared.useDifferentEmail,
        },
        signUp: { form: auth.signUp.form, errors: auth.signUp.errors },
      }}
    />
  );
}
