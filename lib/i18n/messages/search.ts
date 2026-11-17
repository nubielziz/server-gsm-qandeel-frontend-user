// Product search (feature 29, backend plan §7): the header combobox and the results page's search extras.

export const search = {
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
};
