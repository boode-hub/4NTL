# Third-party notices

## ExtPay (store edition only)

The store edition (Chrome Web Store / Firefox Add-ons) includes
[ExtPay](https://github.com/Glench/ExtPay) 3.1.2 by Glen Chiacchieri, which
connects to ExtensionPay for the paid unlock. Its license file is LGPL-3.0 (its
package metadata says AGPL-3.0-or-later). It ships unmodified: as `ExtPay.js` (the
script on extensionpay.com) and bundled into `background.js` and `options.js`.
4NTL's complete source and build steps are at <https://github.com/boode-hub/4NTL>,
so the library can be replaced or rebuilt (`npm ci && npm run build`).
The free GitHub edition contains no ExtPay code.

ExtPay includes [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)
0.7.0 by Mozilla, MPL-2.0 (<https://mozilla.org/MPL/2.0/>), unmodified.

## Twemoji Country Flags font

The country flags in the result card and the saved list are drawn with the
"Twemoji Country Flags" font (`src/ui/flags.woff2`), from
[country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill)
(code: MIT, Copyright (c) 2022 TalkJS).

The flag artwork comes from [Twemoji](https://github.com/twitter/twemoji),
Copyright 2019 Twitter, Inc and other contributors, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
