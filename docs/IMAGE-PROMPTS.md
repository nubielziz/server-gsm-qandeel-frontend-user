# Site images to add

The site never draws its own artwork. Each image below is an empty slot until a file with **exactly this name** is
placed in `storefront/public/images/`. Until then the page shows a plain placeholder surface, so nothing breaks.
Save each file as a real JPEG (or PNG for the `.png` names): the extension must match the format. `npm run dev` picks up
new files at once; a production server checks once per run, so restart it (or rebuild) after adding files.

General style for every image (from the owner's mockups): clean, premium, monochrome studio look; white, light-grey
or charcoal backgrounds; soft shadows; subtle violet/purple screen glow as the only accent; no text, no logos of
other brands, no watermarks. Photographic or high-quality 3D render.

| File | Size (px) | Where it shows |
|---|---|---|
| `logo-mark.png` | 512 × 512, transparent | Brand mark next to "GSM Store" in every header and the sidebar |
| `sign-in-hero.jpg` | 1600 × 1800 | Left half of the sign-in and sign-up pages (desktop) |
| `home-hero.jpg` | 1920 × 1080 | Right side of the large dark banner at the top of the shop home page |
| `home-promo.jpg` | 1200 × 900 | Right side of the small dark "Track your order" card beside the home banner |
| `home-merchants.jpg` | 1200 × 900 | Right side of the dark "For merchants" banner near the bottom of the home page |
| `home-help.jpg` | 1200 × 900 | Right side of the light "Help center" banner near the bottom of the home page |
| `home-support.jpg` | 1200 × 900 | Right side of the light "Support" banner near the bottom of the home page |
| `service-imei.jpg` | 1200 × 900 | Art for IMEI-check services (small square on cards, wide on the service page) |
| `service-server.jpg` | 1200 × 900 | Art for server / credits services |
| `service-remote.jpg` | 1200 × 900 | Art for remote / tool-activation services |
| `service-file.jpg` | 1200 × 900 | Art for file services (firmware, unlock files) |
| `og-default.jpg` | 1200 × 630 | Preview image when a page is shared on social media |
| `app/favicon.ico` (replace the file; NOT in public/images) | 48 × 48 ICO | Browser tab icon (today it is the Next.js scaffold's icon). Make it from `logo-mark.png` |
| `brands/<name>.png`, `carriers/<name>.png` | transparent PNG, ~96 px high, cropped to the logo | Brand and carrier logos on tiles, cards and the service page. 86 are in place; how to add one, naming, sources and trademarks: `docs/LOGOS.md` (then run `npm run logos`) |
| `collections/<kind>-<name>.jpg` (optional) | 1200 × 900 | Left side of a "Featured collections" banner on the home page. The site picks the brands, countries and carriers with the most services, so add the ones your catalog has: `<kind>` = `brand`, `country` or `carrier`; `<name>` = the brand or carrier name, or the 2-letter country code, lower-cased, every space or symbol → `-` (e.g. `brand-apple.jpg`, `brand-samsung.jpg`, `country-us.jpg`, `country-gb.jpg`, `carrier-at-t.jpg`) |

The five `home-*.jpg` images sit on the right side of their card and fade into it on the left, where the text is. Keep
the subject in the right half and the left half empty, in the card's colour (near-black `#111111` for the dark cards,
white for the light ones). The Arabic site shows them mirrored, so they must not contain text, logos or anything that
reads wrong when flipped. Until a file exists its card shows a plain lit surface instead.

The `collections/*.jpg` images are the other way round: they sit on the LEFT side of a light card and fade into it on
the right, where the text is. Keep the subject in the left half and the right half empty and white. A card with an
image is always light (only a card without one may be dark). They are mirrored on the Arabic site too.

## Prompts

### logo-mark.png
Minimal flat app-icon style brand mark for "GSM Store": a stylised smartphone outline combined with a small gear,
bold geometric strokes, solid near-black (#111111) on a fully transparent background, centred, generous padding,
crisp vector-like edges, no text.

### sign-in-hero.jpg
Bright minimalist studio scene: a modern laptop on a white desk showing a dark e-commerce dashboard with a purple
gradient smartphone wallpaper, a premium smartphone with a purple lock screen leaning beside it, a small green plant
on the left edge and a black pen cup on the right; light-grey seamless background with soft diagonal light,
shallow depth of field, lots of empty light-grey space in the top third for a headline. No readable text or logos.

### home-hero.jpg
Dark premium product banner: two flagship smartphones with triple-lens cameras and deep purple glossy backs, floating
at a slight angle on the right side, dramatic rim lighting on a charcoal-to-black gradient background, subtle smoke,
the left 55% of the frame dark and empty for text. Studio product photography, high contrast, no text, no logos.

### home-promo.jpg
Dark square-ish product shot: a smartphone lying face-up on black glass on the right side of the frame, a soft violet
glow from its screen and a thin line of light travelling across it, suggesting an order in progress; near-black
background, the left half dark and empty for a title. No text, no logos.

### home-merchants.jpg
Dark studio shot for resellers: a tidy phone-repair workbench seen at a three-quarter angle on the right side of the
frame, two smartphones and a small black service box with a single status LED, dramatic rim light, near-black
(#111111) background, the left half dark and empty for text. High contrast, no text, no logos.

### home-help.jpg
Bright minimalist studio shot: an open notebook with blank pages and a matte black smartphone resting on it, on the
right side of the frame, soft shadow, pure white seamless background, the left half white and empty for text.
No text, no logos.

### home-support.jpg
Bright minimalist studio shot: a matte black headset with a microphone lying on a white desk on the right side of the
frame, soft shadow, pure white seamless background, the left half white and empty for text. No text, no logos.

### service-imei.jpg
Light-grey studio product shot of a modern smartphone standing upright, back camera visible, purple-silver finish,
soft shadow on a seamless light background, centred with space around it. No text, no logos.

### service-server.jpg
Light-grey studio render of a sleek black rack server unit with a few small status LEDs, three-quarter view, soft
shadow, clean seamless light background. No text, no logos.

### service-remote.jpg
Light-grey studio product shot of a black USB service dongle / hardware key with a subtle red accent line next to a
smartphone, three-quarter view, soft shadow, seamless light background. No text, no logos.

### service-file.jpg
Light-grey studio render of a smartphone with a translucent floating document/firmware card above its screen and a
thin violet glow, minimal and clean, soft shadow, seamless light background. No text, no logos.

### collections/<kind>-<name>.jpg (one per collection)
Template: "Bright minimalist studio shot: [SUBJECT] on the left side of the frame, soft shadow, pure white seamless
background, the right half white and empty for text. No text, no logos." Subjects that fit:
- `brand-apple.jpg`: two premium smartphones with rounded edges and a triple camera, one standing, one lying, silver
  and graphite finish (a generic phone: no Apple logo).
- `brand-samsung.jpg`: a slim flagship smartphone with a tall screen and a vertical row of three cameras, phantom
  black finish (no Samsung logo).
- `brand-xiaomi.jpg` and other brands: a modern smartphone in that brand's typical colour, three-quarter view.
- `country-us.jpg`, `country-gb.jpg`, `country-fr.jpg` …: a smartphone with a softly glowing SIM card tray pulled out,
  beside a small paper map fragment of that country (no flags, no text).
- `carrier-<name>.jpg`: a smartphone with a nano SIM card and a SIM eject pin on the desk, a thin violet glow on
  the screen.

### og-default.jpg
Wide dark banner: a premium purple smartphone at the right on a charcoal gradient, soft rim light, the left half dark
and empty (the site name may be added later). No text, no logos.
