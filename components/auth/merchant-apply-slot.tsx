// MerchantApplySlot: the "Become a merchant" form with the same menu of countries as the sign-up form: the shop's tax-rate
// countries when it has any, else every country (`readShopCountries`). The page puts this behind <Suspense> with a same-size
// skeleton, so the rest of the page stays static. Nothing here is personal data and nothing is sent to our API.
import { auth } from "@/lib/i18n/messages/auth";
import { MerchantApplyForm } from "./merchant-apply-form";
import { readShopCountries } from "./shop-countries";

export async function MerchantApplySlot({ digits, display }: { digits: string; display: string }) {
  const countries = await readShopCountries();
  return (
    <MerchantApplyForm
      digits={digits}
      display={display}
      countries={countries}
      t={{ fields: auth.fields, errors: auth.signUp.errors, becomeMerchant: auth.becomeMerchant }}
    />
  );
}
