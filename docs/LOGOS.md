# Brand and carrier logos

The site shows a brand's or carrier's logo in place of its initials or the signal icon on the home page tiles and the
light featured collection cards. For a service, the brand's logo also replaces the type picture
(`public/images/service-<type>.jpg`, the same for every service of a type, so only a fallback): in the corner of its
cards (a logo that is only a symbol keeps the name beside it), in the quick view and at the top of its page. A service
without a brand logo keeps the type picture. Logos are files, never drawn: `public/images/brands/<name>.png` and
`public/images/carriers/<name>.png`.

## Adding or replacing a logo

1. Save a **transparent PNG cropped tight to the logo**, about **96 px high** (any width up to 480 px), coloured for a
   white background. A logo made for dark backgrounds (white parts) must be made dark first.
2. Name it after the brand or carrier as the catalog writes it: lower case, every space or symbol → `-`
   (`Apple` → `apple.png`, `AT&T` → `at-t.png`, `T-Mobile` → `t-mobile.png`). A longer catalog name finds the logo of its
   first words (`Cricket Wireless` → `cricket.png`, `Vodafone UK` → `vodafone.png`); a few other spellings are mapped in
   `LOGO_ALIASES` (`components/store/service-art.tsx`), e.g. `ATT` → `at-t`, `Mobinil` → `orange`, `iPhone` → `apple`.
3. Run `npm run logos` (records each logo's size in `lib/logo-sizes.json`, so it is drawn at its real proportions without
   reading files while the page renders). Until then a new logo still shows, in a 2:1 box.

## Trademarks

Every logo is a trademark of its owner. The store shows them only to say which devices, networks and products a service
is for. Some owners publish rules for showing their logo (sizes, colours, spacing); follow them, and remove a logo if
its owner asks. Simple Icons' drawings are CC0-1.0, the Wikimedia Commons files carry the licence below, and the logos
from official sites were taken from the owners' own pages.

## Files (86)

| File | Source | Terms |
|---|---|---|
| `brands/alcatel.png` | Wikimedia Commons [Alcatel logo 2016.svg](https://commons.wikimedia.org/wiki/File:Alcatel_logo_2016.svg) | Public domain; trademark of its owner |
| `brands/app-store.png` | Simple Icons `appstore` (App Store), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/apple.png` | Simple Icons `apple` (Apple), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/apple-music.png` | Simple Icons `applemusic` (Apple Music), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/asus.png` | Simple Icons `asus` (ASUS), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/blackberry.png` | Simple Icons `blackberry` (Blackberry), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/blackview.png` | official site https://www.blackview.hk | trademark of its owner |
| `brands/chimera.png` | official site https://www.chimeratool.com | trademark of its owner |
| `brands/discord.png` | Simple Icons `discord` (Discord), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/doogee.png` | official site https://www.doogee.com | trademark of its owner |
| `brands/ea.png` | Simple Icons `ea` (EA), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/epic-games.png` | Simple Icons `epicgames` (Epic Games), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/facebook.png` | Simple Icons `facebook` (Facebook), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/fairphone.png` | Simple Icons `fairphone` (Fairphone), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/fortnite.png` | Simple Icons `fortnite` (Fortnite), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/free-fire.png` | official site https://ff.garena.com (brand colour #FFBA00 (set by the site's CSS)) | trademark of its owner |
| `brands/google.png` | Simple Icons `google` (Google), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/google-play.png` | Simple Icons `googleplay` (Google Play), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/halabtech.png` | official site https://halabtech.com | trademark of its owner |
| `brands/honor.png` | Simple Icons `honor` (Honor), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/htc.png` | Simple Icons `htc` (HTC), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/huawei.png` | Simple Icons `huawei` (Huawei), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/infinix.png` | Wikimedia Commons [Infinix logo.svg](https://commons.wikimedia.org/wiki/File:Infinix_logo.svg) | Public domain; trademark of its owner |
| `brands/instagram.png` | Simple Icons `instagram` (Instagram), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/itel.png` | Wikimedia Commons [Itel Mobile logo 2023.svg](https://commons.wikimedia.org/wiki/File:Itel_Mobile_logo_2023.svg) | Public domain; trademark of its owner |
| `brands/itunes.png` | Simple Icons `itunes` (iTunes), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/kaspersky.png` | Simple Icons `kaspersky` (Kaspersky), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/kyocera.png` | Simple Icons `kyocera` (Kyocera), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/lenovo.png` | Simple Icons `lenovo` (Lenovo), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/lg.png` | Simple Icons `lg` (LG), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/macos.png` | Simple Icons `macos` (macOS), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/meizu.png` | Simple Icons `meizu` (Meizu), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/motorola.png` | Simple Icons `motorola` (Motorola), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/netflix.png` | Simple Icons `netflix` (Netflix), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/nokia.png` | Simple Icons `nokia` (Nokia), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/nordvpn.png` | Simple Icons `nordvpn` (NordVPN), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/octoplus.png` | official site https://octoplusbox.com | trademark of its owner |
| `brands/oneplus.png` | Simple Icons `oneplus` (OnePlus), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/oppo.png` | Simple Icons `oppo` (OPPO), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/panasonic.png` | Simple Icons `panasonic` (Panasonic), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/playstation.png` | Simple Icons `playstation` (PlayStation), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/pubg.png` | Simple Icons `pubg` (PUBG), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/razer.png` | Simple Icons `razer` (Razer), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/realme.png` | Wikimedia Commons [Realme-realme- logo box-RGB-01.svg](https://commons.wikimedia.org/wiki/File:Realme-realme-_logo_box-RGB-01.svg) | Public domain; trademark of its owner |
| `brands/riot-games.png` | Simple Icons `riotgames` (Riot Games), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/roblox.png` | Simple Icons `roblox` (Roblox), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/samsung.png` | Simple Icons `samsung` (Samsung), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/sigma.png` | official site https://sigmakey.com | trademark of its owner |
| `brands/snapchat.png` | Simple Icons `snapchat` (Snapchat), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/sony.png` | Simple Icons `sony` (Sony), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/spotify.png` | Simple Icons `spotify` (Spotify), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/steam.png` | Simple Icons `steam` (Steam), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/tcl.png` | Wikimedia Commons [Logo of the TCL Corporation.svg](https://commons.wikimedia.org/wiki/File:Logo_of_the_TCL_Corporation.svg) | Public domain; trademark of its owner |
| `brands/tecno.png` | Wikimedia Commons [Tecno Mobile logo.svg](https://commons.wikimedia.org/wiki/File:Tecno_Mobile_logo.svg) | Public domain; trademark of its owner |
| `brands/telegram.png` | Simple Icons `telegram` (Telegram), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/tiktok.png` | Simple Icons `tiktok` (TikTok), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/ulefone.png` | official site https://www.ulefone.com | trademark of its owner |
| `brands/valorant.png` | Simple Icons `valorant` (Valorant), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/vivo.png` | Simple Icons `vivo` (vivo), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/whatsapp.png` | Simple Icons `whatsapp` (WhatsApp), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/wondershare.png` | Simple Icons `wondershare` (Wondershare), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/xiaomi.png` | Simple Icons `xiaomi` (Xiaomi), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/youtube.png` | Simple Icons `youtube` (YouTube), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `brands/z3x.png` | official site https://z3x-team.com (white letters made dark for light cards) | trademark of its owner |
| `brands/zte.png` | Wikimedia Commons [ZTE-logo.svg](https://commons.wikimedia.org/wiki/File:ZTE-logo.svg) | Public domain; trademark of its owner |
| `carriers/airtel.png` | Simple Icons `airtel` (Airtel), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/at-t.png` | Simple Icons `atandt` (AT&T), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/du.png` | official site https://www.du.ae (one colour (#C724B1) in place of the site's white gradient) | trademark of its owner |
| `carriers/jawwal.png` | official site https://www.jawwal.ps | trademark of its owner |
| `carriers/jio.png` | Simple Icons `jio` (Jio), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/korek.png` | official site https://www.korektel.com | trademark of its owner |
| `carriers/movistar.png` | Simple Icons `movistar` (Movistar), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/o2.png` | Simple Icons `o2` (O2), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/omantel.png` | official site https://www.omantel.om | trademark of its owner |
| `carriers/orange.png` | Simple Icons `orange` (Orange), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/rakuten.png` | Simple Icons `rakuten` (Rakuten), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/stc.png` | official site https://www.stc.com.sa | trademark of its owner |
| `carriers/t-mobile.png` | Simple Icons `deutschetelekom` (Deutsche Telekom), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/telefonica.png` | Simple Icons `telefonica` (Telefónica), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/telekom.png` | Simple Icons `deutschetelekom` (Deutsche Telekom), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/turkcell.png` | official site https://www.turkcell.com.tr | trademark of its owner |
| `carriers/umniah.png` | official site https://www.umniah.com | trademark of its owner |
| `carriers/verizon.png` | Simple Icons `verizon` (Verizon), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/virgin-media.png` | Simple Icons `virginmedia` (Virgin Media), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/vodafone.png` | Simple Icons `vodafone` (Vodafone), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `carriers/we.png` | official site https://te.eg | trademark of its owner |

## Not found yet

- **Wikimedia Commons downloads in progress** (the server limits the rate): EE, Three, giffgaff, Sprint, Cricket, Boost
  Mobile, TracFone, Straight Talk, Xfinity, Spectrum, Rogers, Bell, Telus, Fido, Koodo, Freedom Mobile, Bouygues, Free,
  A1, Claro, Telcel, Tigo, TIM, docomo, SoftBank, Optus, Telstra, Zain, Mobily, Etisalat, Ooredoo, Asiacell, inwi,
  Djezzy, Mobilis, Batelco, Safaricom, Globe, Proximus, KPN, Swisscom, Singtel, MTN; Micromax, Nubia, POCO, Hisense,
  Wiko, Coolpad.
- **No free or downloadable source found:** Maroc Telecom (site timed out), Metro by T-Mobile, C Spire and UnlockTool
  (their sites block downloads), EFT (no official site found), Nothing (the site has only its red dot), US Cellular (now
  T-Mobile), au, Eir, China Mobile, SFR, Garena; most GSM tools (Hydra, UMT, NCK, Infinity CM2,
  Pandora, Cheetah, TSM, MRST, Miracle, Medusa …). Resellers usually get these from the vendor's reseller kit.
- **Left out on purpose:** Microsoft, Windows, Xbox, Adobe, Amazon and Nintendo (their owners had them removed from
  Simple Icons, a sign they object to such use).

## Payment method logos (5)

The bundled logos of the ready-made payment methods (feature 32, backend B232) are in `public/images/payments/`, named after the
method's preset key; `npm run logos` writes their sizes to `lib/payment-logo-sizes.json`, and `components/ui/payment-method-logo.tsx`
shows them (a logo that staff uploaded for a method wins; a method with no file shows an icon). Each is 128 x 128 pixels. Bank
transfer and Crypto transfer have no file: they show the bank and the coin icon.

| File | Source | Terms |
|---|---|---|
| `payments/binance_pay.png` | Simple Icons `binance` (the Binance mark, `#F0B90B`), fetched 2026-11-17 | CC0-1.0 icon data; trademark of its owner |
| `payments/fawry_transfer.png` | Simple Icons `fawry` (the Fawry mark, `#FFD300`), fetched 2026-11-17 | CC0-1.0 icon data; trademark of its owner |
| `payments/instapay.png` | the InstaPay Egypt app icon from its Google Play listing (`com.egyptianbanks.instapay`), fetched 2026-11-17 | trademark of its owner |
| `payments/nowpayments.png` | the NOWPayments GitHub organisation picture (`https://github.com/NowPaymentsIO.png`), fetched 2026-11-17 | trademark of its owner |
| `payments/vodafone_cash.png` | Simple Icons `vodafone` (the Vodafone speech mark, `#E60000`), fetched 2026-11-17 | CC0-1.0 icon data; trademark of its owner |

## Footer payment marks (19)

The marks of the payment methods the footer names (`components/layout/payment-marks.tsx`; the fixed list is
`lib/payments/accepted-methods.ts`, the owner's, 2026-11-23) are in `public/images/payment-marks/`. Each is 128 x 128 pixels with
a clear margin and is drawn at one fixed size on a light tile, so `npm run logos` does not list them. Bank transfers and Express
Wallet have no file: they show the bank and the wallet icon. opBNB shows the BNB Chain mark (it is a network of BNB Chain).
A test (`components/layout/payment-marks.test.tsx`) fails when the list names a file that is missing, or the folder holds a
file the list does not use. Visa and Mastercard publish rules for showing their marks where their cards are taken: follow
them. All fetched 2026-11-23.

| File | Source | Terms |
|---|---|---|
| `payment-marks/arbitrum.png` | Web3 Icons `networks/branded/arbitrum-one` (`@web3icons/core` 4.0.61) | MIT package; trademark of its owner |
| `payment-marks/base.png` | Web3 Icons `networks/branded/base` (`@web3icons/core` 4.0.61) | MIT package; trademark of its owner |
| `payment-marks/binance.png` | the drawing of `payments/binance_pay.png` (Simple Icons `binance`, `#F0B90B`) | CC0-1.0 icon data; trademark of its owner |
| `payment-marks/bitcoin.png` | Simple Icons `bitcoin` (Bitcoin, `#F7931A`), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `payment-marks/bnb-chain.png` | Simple Icons `bnbchain` (BNB Chain, `#F0B90B`), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `payment-marks/ethereum.png` | Simple Icons `ethereum` (Ethereum, `#3C3C3D`), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `payment-marks/gate-io.png` | Web3 Icons `exchanges/branded/gate-io` (`@web3icons/core` 4.0.61) | MIT package; trademark of its owner |
| `payment-marks/mastercard.png` | Wikimedia Commons [Mastercard-logo.svg](https://commons.wikimedia.org/wiki/File:Mastercard-logo.svg) | Public domain; trademark of its owner |
| `payment-marks/metamask.png` | Web3 Icons `wallets/branded/metamask` (`@web3icons/core` 4.0.61) | MIT package; trademark of its owner |
| `payment-marks/optimism.png` | Simple Icons `optimism` (Optimism, `#FF0420`), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `payment-marks/polygon.png` | Simple Icons `polygon` (Polygon, `#7B3FE4`), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `payment-marks/solana.png` | Simple Icons `solana` (Solana, `#9945FF`), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `payment-marks/tron.png` | Web3 Icons `networks/branded/tron` (`@web3icons/core` 4.0.61) | MIT package; trademark of its owner |
| `payment-marks/tronlink.png` | the TronLink GitHub organisation picture (`https://github.com/TronLink.png`) | trademark of its owner |
| `payment-marks/trust-wallet.png` | Web3 Icons `wallets/branded/trust` (`@web3icons/core` 4.0.61) | MIT package; trademark of its owner |
| `payment-marks/usdc.png` | Web3 Icons `tokens/branded/USDC` (`@web3icons/core` 4.0.61) | MIT package; trademark of its owner |
| `payment-marks/usdt.png` | Simple Icons `tether` (Tether, `#50AF95`), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `payment-marks/visa.png` | Simple Icons `visa` (Visa, `#1A1F71`), v16.37.0 | CC0-1.0 icon data; trademark of its owner |
| `payment-marks/walletconnect.png` | Simple Icons `walletconnect` (WalletConnect, `#3B99FC`), v16.37.0 | CC0-1.0 icon data; trademark of its owner |

## The IMEI-HUB logo

The site's own logo is the owner's (`IH Orbit IMEI-HUB Logo.png`, supplied 2026-11-17), cut into files by a script that only
crops, removes the white ground and, for the two `-inverse` files (dark surfaces), turns the dark ink white:

| File | What |
|---|---|
| `public/images/logo-mark.png`, `logo-mark-inverse.png` | the mark, the "IH" in its orbit (575 × 432, transparent) |
| `public/images/logo-wordmark.png`, `logo-wordmark-inverse.png` | the name "IMEI-HUB" (984 × 160, transparent) |
| `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png` | the mark on a white tile, so the dark ink reads on a dark tab strip: the browser tab (16, 32 and 48 px), the 192 px icon, the touch icon |

`components/layout/logo.tsx` shows them (the mark about 1.8 times as tall as the name, as in the owner's picture; both a size
smaller below 640 px, so a signed-in header still fits a phone, and the name hidden from 360 px down). The owner's source
picture, the script and the full lock-ups (mark, name and tagline in one picture) are kept outside the repository
(`/home/saifi/gsm-project/.brand/`). To replace the logo, replace these files; a logo of another shape also needs the boxes
(`MARK_BOX`, `WORDMARK_BOX`) in `components/layout/logo.tsx`, in whole pixels.
