# Icons, logos and font

| What | Where it is used | Source | Licence |
|---|---|---|---|
| UI icons (tabs with filled forms, send, receive, swap, back, close, chevron, copy, share, paste, settings, check, warning, pending, external link, eye, eye off) | `src/app/icons/` | drawn for this project on a 28 grid; no outline copied from any set, the gear is generated from a formula | the project's own work |
| Account emblem (three sketches, temporary until the owner picks one), success mark | `src/app/art/` | drawn for this project | the project's own work |
| Coin, network and wallet logos (ETH, SOL, TON, USDC; Ethereum, Base, Solana, TON; MetaMask, Rabby, Coinbase Wallet, Phantom, Solflare, Backpack, WalletConnect) | `src/app/marks.tsx`, `src/app/art/` | [@web3icons/react](https://github.com/0xa3k5/web3icons) 4.1 | MIT. The marks themselves belong to their projects and are used only to name them |
| Contract-call mark in operation rows (temporary, until the drawn set has one) | `src/app/glyph.tsx` | [@phosphor-icons/react](https://github.com/phosphor-icons/react) 2.1 | MIT |
| Onest, the interface typeface (variable, self-hosted) | `src/app/App.tsx` | [@fontsource-variable/onest](https://github.com/simpals/onest) 5.3 | SIL Open Font License 1.1 |
| Literata, the welcome headline (Cyrillic and Latin subsets, self-hosted) | `src/app/wallet.css` | [@fontsource-variable/literata](https://github.com/googlefonts/literata) 5.3 | SIL Open Font License 1.1 |

Colour and type values follow Keeper's open-source theme (`ref/keeper/tonkeeper-defaultTheme.ts`,
`tonkeeper-Text.tsx`, https://github.com/tonkeeper/tonkeeper-web, Apache-2.0): values only, no code, logo or name.

Reference only, not shipped: Keeper's App Store screenshots (`ref/keeper/*.jpg`) and the icon file of tonkeeper-web
(Apache-2.0) were used to compare stroke weight, arrowhead angle and proportions; no outline was copied.
