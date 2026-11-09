# Site images to add

The site never draws its own artwork. Each image below is an empty slot until a file with **exactly this name** is
placed in `storefront/public/images/`. Until then the page shows a plain placeholder surface, so nothing breaks.
After adding or replacing files, restart `npm run dev` / rebuild (the site checks which files exist once per run).

General style for every image (from the owner's mockups): clean, premium, monochrome studio look; white, light-grey
or charcoal backgrounds; soft shadows; subtle violet/purple screen glow as the only accent; no text, no logos of
other brands, no watermarks. Photographic or high-quality 3D render.

| File | Size (px) | Where it shows |
|---|---|---|
| `logo-mark.png` | 512 × 512, transparent | Brand mark next to "GSM Store" in every header and the sidebar |
| `sign-in-hero.jpg` | 1600 × 1800 | Left half of the sign-in and sign-up pages (desktop) |
| `home-hero.jpg` | 1920 × 1080 | Large dark banner at the top of the shop home page |
| `home-promo.jpg` | 1200 × 900 | Small dark promo card beside the home banner (free IMEI check) |
| `service-imei.jpg` | 1200 × 900 | Art for IMEI-check services (cards and service page) |
| `service-server.jpg` | 1200 × 900 | Art for server / credits services |
| `service-remote.jpg` | 1200 × 900 | Art for remote / tool-activation services |
| `service-file.jpg` | 1200 × 900 | Art for file services (firmware, unlock files) |
| `og-default.jpg` | 1200 × 630 | Preview image when a page is shared on social media |
| `app/favicon.ico` (replace the file; NOT in public/images) | 48 × 48 ICO | Browser tab icon (today it is the Next.js scaffold's icon). Make it from `logo-mark.png` |
| `brands/<brand>.png` (optional) | 480 × 240, transparent | Brand logo on service cards. `<brand>` = the brand name lower-cased, spaces → `-` (e.g. `apple.png`, `samsung.png`). Only add logos you have the right to use |

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
Dark square-ish product shot: a smartphone lying face-up on black glass with a soft violet glow from the screen and a
faint scanning-line light effect across it, suggesting a device check; charcoal background, empty space on the left
for a title. No text, no logos.

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

### og-default.jpg
Wide dark banner: a premium purple smartphone at the right on a charcoal gradient, soft rim light, the left half dark
and empty (the site name may be added later). No text, no logos.
