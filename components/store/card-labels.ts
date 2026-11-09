// The labels a ServiceCard needs, from the shop and shared message namespaces.
import type { CommonMessages } from "@/lib/i18n/messages/common";
import type { StoreMessages } from "@/lib/i18n/messages/store";
import type { ServiceCardLabels } from "./service-card";

export function serviceCardLabels(t: StoreMessages, common: CommonMessages): ServiceCardLabels {
  return {
    orderNow: t.card.orderNow,
    delivery: t.card.delivery,
    orderService: t.card.orderService,
    types: common.serviceType,
  };
}
