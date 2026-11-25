# 006 A dark theme

**Context.** On 2026-11-25 the owner asked for a dark mode on the whole site. Until then the site was light only by rule
(`app/globals.css` said so, the Turnstile widget and the browser's own colours were fixed to light). Every page was already written
with the design tokens of `app/globals.css` and the default Tailwind palette is switched off, so no page holds a colour of its own.

**Decision.**

1. **Two themes, one attribute.** The theme is `data-theme="light" | "dark"` on `<html>`. Light is the owner's mockups, unchanged.
   Dark is the same monochrome look on a near-black page: every colour and shadow token has a dark value in the
   `:root[data-theme="dark"]` block of `app/globals.css`. A page written with tokens needs nothing more.
2. **Who chooses.** The visitor's choice is kept in the browser (`localStorage` `gsm.theme`, never sent anywhere). With no choice the
   site follows the system (`prefers-color-scheme`) and keeps following it. Choosing the theme the system already has removes the
   stored choice. `THEME_GUARD` (`lib/theme/theme.ts`) is an inline script, the first thing in `<body>` of the root layout and of
   `app/global-not-found.tsx`: it sets the attribute before the first paint, so there is no flash of the other theme and the static
   pages stay static (no cookie is read). Without JavaScript the site is light.
3. **The switch** is `ThemeToggle` (`components/layout/theme-toggle.tsx`): one icon button with `aria-pressed` (pressed = dark). It
   stands beside the currency picker in the shop header (inside the menu drawer on phones), on the rail of the account area (in its
   menu drawer on phones), in the top corner of the sign-in pages and in the checkout header (from `sm` up: a phone's checkout
   header has no room, and the theme chosen elsewhere applies there). While the theme changes nothing eases
   (`.theme-switching`). The guard also applies the choice again when a page comes back from the back/forward cache.
4. **Two families that look alike in light and part in dark.** The old `inverse` colour did two jobs. They are now two families,
   picked by what the thing is:
   - `primary` / `primary-raised` / `on-primary`: solid controls and marks (the main button, a checked box, the selected pill, a
     count, a tooltip). Near-black in light, near-white in dark.
   - `inverse` / `inverse-raised` / `inverse-edge` / `on-inverse`: dark panels (hero cards, the rail, the footer). Near-black in
     light, a raised dark panel in dark; the text on them is white in both, and the white button on them (`variant="inverse"`) is
     white in both (`plate`).
   Also new: `surface-raised` (a part that stands on a sunken well), `danger-strong` (the hover of a danger button) and
   `plate` / `plate-raised` / `on-plate` (what stays white in both themes: the white control on a dark panel, and the plate under
   a logo, below).
   **Shadows** change with the theme too, so each `--shadow-*` token points at an `--elevation-*` custom property: Tailwind
   writes a shadow token's value into its utilities at build time, and a plain property is read at run time.
5. **Pictures.**
   - The site's logo has dark ink and white ink files; a normal surface carries both in the HTML and the theme shows one
     (`components/layout/logo.tsx`). A hidden lazy image is not downloaded.
   - Brand, carrier and payment logos are files made for a light background. In dark they sit on a white plate (`logo-plate`,
     `bg-plate`), painted around the picture without changing the layout.
   - The art of a `light` banner (a dark subject on a white ground) is drawn as its negative in dark, so it fades into the dark
     card; the sign-in picture is dimmed a little. Photographs of services are left as they are.
6. **`dark:` is not for colours.** The variant exists (`@custom-variant dark`) for what a token cannot do: showing one of two
   pictures or icons, a filter on a picture. A colour is always a token.
7. **Outside the page.** `<meta name="theme-color">` and `color-scheme` follow the system theme (a meta tag cannot read the
   visitor's choice); the Turnstile widget takes the page's theme when it is drawn and is not redrawn on a switch (a redraw would
   spend its token).

**Contrast.** The dark values keep what the light ones promise: `ink-subtle` reaches 4.5:1 on page, surface, muted and sunken;
`control` 3:1 on surface; the status inks 8:1 or more on their soft backgrounds; white on `danger` 4.8:1.

**Checked by.** `lib/theme/theme.test.ts` (the guard and the rule of the choice), `components/layout/theme-toggle.test.tsx`,
`app/en/layout.test.ts`; every page family was looked at in both themes against the isolated demo backend (desktop and phone).
