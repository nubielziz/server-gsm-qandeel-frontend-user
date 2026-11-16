// Product search (feature 29, backend plan §7): the header combobox on English pages and the results page's search
// extras. Arabic pages do not mount the combobox (the search engine is English only), but every key has its Arabic
// text so the namespace stays complete.
import { defineMessages } from "../define";

export const search = defineMessages({
  en: {
    /** The combobox's name (also the header field's label). */
    label: "Search services",
    suggestions: "Suggestions",
    services: "Services",
    filters: "Filters",
    recent: "Recent searches",
    clearRecent: "Clear recent searches",
    popular: "Popular searches",
    /** The phone's fill arrow beside a completion (read by no screen reader: the option itself says the phrase). */
    fill: "Fill in {text}",
    imei: "Check IMEI {imei}",
    didYouMean: "Did you mean {q}?",
    fallback: "Simple search is in use right now",
    taxNote: "Prices before tax",
    noResults: "No services match “{q}”",
    noResultsText: "Check the spelling, try fewer words, or start from a popular search.",
    status: "{suggestions} suggestions, {services} services",
    country: "Country: {name}",
    brand: "Brand: {name}",
    network: "Carrier: {name}",
    category: "Category: {name}",
    bestMatch: "Best match",
    priceTruncated: "Sorted by price among the best 1000 matches",
  },
  ar: {
    label: "ابحث في الخدمات",
    suggestions: "اقتراحات",
    services: "الخدمات",
    filters: "عوامل التصفية",
    recent: "عمليات البحث الأخيرة",
    clearRecent: "مسح عمليات البحث الأخيرة",
    popular: "عمليات البحث الشائعة",
    fill: "إكمال الحقل بـ {text}",
    imei: "افحص رقم IMEI {imei}",
    didYouMean: "هل تقصد {q}؟",
    fallback: "البحث المبسّط مستخدم حاليًا",
    taxNote: "الأسعار قبل الضريبة",
    noResults: "لا توجد خدمات تطابق «{q}»",
    noResultsText: "تحقّق من الكتابة، أو جرّب كلمات أقل، أو ابدأ من عملية بحث شائعة.",
    status: "{suggestions} اقتراحات، {services} خدمات",
    country: "البلد: {name}",
    brand: "العلامة التجارية: {name}",
    network: "الشبكة: {name}",
    category: "الفئة: {name}",
    bestMatch: "الأكثر مطابقة",
    priceTruncated: "مرتّبة حسب السعر بين أفضل 1000 نتيجة مطابقة",
  },
});
