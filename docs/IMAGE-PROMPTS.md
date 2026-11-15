# Site images to add

The site never draws its own artwork. Each image below is an empty slot until a file with **exactly this name** is
placed in `storefront/public/images/`. Until then the page shows a plain placeholder surface, so nothing breaks.
Save each file as a real JPEG (or PNG for the `.png` names): the extension must match the format. `npm run dev` picks up
new files at once; a production server checks once per run, so restart it (or rebuild) after adding files.

General style for every image (owner's change, 2026-11-15: **no purple or violet anywhere**; the images lean to black
and white like the site's own colours, `#111111`, `#f4f4f5`, white): premium monochrome studio look; white, light-grey
or charcoal backgrounds; soft shadows; neutral white light only. Photographic or high-quality 3D render. Add this to
every prompt:

> Style: premium monochrome studio product photography (or a photoreal 3D render). Strictly neutral black-and-white
> palette: black, charcoal, graphite, grey, silver and white only. Neutral daylight-balanced white light (5500 K), no
> coloured lighting, no colour cast. Soft realistic shadows, crisp detail. No text, no numbers, no logos, no watermark.

Negative prompt (for tools that take one): `purple, violet, lavender, lilac, magenta, pink, blue tint, teal, neon glow,
RGB lighting, coloured smoke, colour cast, text, letters, numbers, logo, brand mark, watermark, frame, border`.

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
3:2 (1536 × 1024; it fills the panel under the text, anchored at the bottom). Bright minimalist studio scene: a modern
silver laptop on a white desk, its screen showing a dark-grey e-commerce dashboard made of simple black, grey and white
blocks (no readable text), a generic smartphone in matte black with a black-and-white abstract lock screen leaning
beside it on the left, a black pen cup on the right and a closed black notebook at the front left; light-grey seamless
wall (`#f5f5f6`) with a soft diagonal band of daylight, shallow depth of field, the top third plain light grey and
empty. No plant, no colour accents.

### home-hero.jpg
16:9. Dark premium product banner: two generic flagship smartphones with triple-lens camera modules, one glossy
graphite black and one brushed silver titanium, floating at a slight angle in the right 45% of the frame with their
backs to the camera; dramatic white rim light along their edges, a faint wisp of neutral grey smoke behind them, a thin
white reflection on a black glossy floor; a smooth charcoal-to-black gradient background (`#111111` on the left). The
left 55% of the frame dark, plain and empty for text. High contrast, black and white only.

### home-promo.jpg
4:3. Dark product shot: a generic matte-black smartphone lying face-up on black glass in the right half of the frame,
low three-quarter angle; its screen shows a minimal black-and-white abstract wave wallpaper with one thin line of pure
white light travelling across it, suggesting an order in progress; a soft white glow from the screen reflected on the
glass; near-black background (`#111111`), the left half dark and empty for a title.

### home-merchants.jpg
4:3. Dark studio shot for resellers: a tidy phone-repair workbench at a three-quarter angle in the right half of the
frame: a black anti-static mat, two smartphones (one with a black-and-white screen, one opened showing its circuit
board), a small black aluminium service box with a single white status LED and a cable, precision screwdrivers with
silver handles in a black stand, tweezers and a grey opening pick, a black desk lamp casting a cool white pool of light;
dramatic white rim light, near-black (`#111111`) background, the left half dark and empty for text. No plant, no
colour accents.

### home-help.jpg
Bright minimalist studio shot: an open notebook with blank pages and a matte black smartphone resting on it, on the
right side of the frame, soft shadow, pure white seamless background, the left half white and empty for text.
No text, no logos.

### home-support.jpg
Bright minimalist studio shot: a matte black headset with a microphone lying on a white desk on the right side of the
frame, soft shadow, pure white seamless background, the left half white and empty for text. No text, no logos.

### service-imei.jpg
4:3. Light-grey studio product shot: a generic modern smartphone standing upright, back to the camera at a slight
three-quarter turn, triple-lens camera module visible, natural silver titanium finish with a graphite camera bump,
centred with generous space around it; soft diffused white light from the top left, a soft contact shadow, seamless
light-grey background (`#ededef` to `#f5f5f6`).

### service-server.jpg
Light-grey studio render of a sleek black rack server unit with a few small status LEDs, three-quarter view, soft
shadow, clean seamless light background. No text, no logos.

### service-remote.jpg
4:3. Light-grey studio product shot: a black USB service dongle / hardware key with a thin silver accent line, lying
next to a generic graphite-black smartphone whose screen shows a black-and-white abstract wave wallpaper, three-quarter
top view, soft shadow, seamless light-grey background (`#ededef`).

### service-file.jpg
4:3. Light-grey studio render: a generic graphite-black smartphone lying at a three-quarter angle with a dark-grey
screen; above the screen floats a translucent frosted-glass document card with a simple white chip icon and a thin
white progress bar, casting a soft white glow onto the screen (a firmware file being installed); minimal and clean,
soft shadow, seamless light-grey background (`#ededef`). White, grey, black and clear glass only.

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
- `carrier-<name>.jpg`: a smartphone with a nano SIM card and a SIM eject pin on the desk, a thin white glow on
  the screen.

### og-default.jpg
1.91:1. Wide dark banner: two generic premium smartphones at the right, one showing its screen with a black-and-white
abstract wave wallpaper, one showing its silver titanium back with a triple camera; soft white rim light, a thin arc of
white light sweeping behind them, a reflection on a black glossy floor, charcoal-to-black gradient background
(`#111111`); the left half dark and empty (the site name may be added later).
