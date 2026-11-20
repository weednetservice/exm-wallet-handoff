# Person avatars

```tsx
import { PersonAvatar } from "../avatars"

<PersonAvatar identity={publicOwnerAddress} kind="account" size={44} />
<PersonAvatar identity={contact.id} kind="contact" size={40} />
```

`identity` accepts a public account identifier or the saved contact ID. Never pass a seed, private key or password. Account and contact assignments have separate namespaces. EVM checksum spelling is normalized; case-sensitive identifiers remain case-sensitive. Renaming a contact does not change its portrait when `contact.id` stays the same.

The first assignment uses `crypto.getRandomValues` with rejection sampling and is stored under `exm.personAvatar.v1:<kind>:<public ID>`. Existing valid assignments are reused. Denied storage keeps an in-memory assignment; unavailable randomness falls back to a stable hash of the public identifier. This decorative preference never throws into wallet operations. Sixteen portraits mean different contacts can share a portrait; it does not verify identity or replace address checking.

Optional props: `label` adds `role="img"` and an accessible name; omitted labels make the portrait decorative. `className` allows layout integration. `index={0..15}` selects a fixed atlas cell for previews without allocating an identity. `size` defaults to 44 CSS px. The component is a span, so its containing interactive control owns keyboard behavior and the tap target.

Current asset: `src/app/art/avatars/exm-portraits-v2.png`, a lighter flat upper-body collection reviewed at actual UI sizes. The first `exm-portraits.png` remains archived. Both generated PNGs are kept intact; `background-size: 400% 400%` and row/column positioning select the cells, and CSS performs circular clipping. Current generation provenance and the full prompt are in `../art/avatars/PROMPT-v2.md`.

Quick transfer uses 40px portraits with visible captions. Similar name prefixes use the surname; identical names use a short public address fragment. Captions do not change the saved name, address or random portrait assignment. Large text expands the horizontally scrollable slot so the address ending stays visible. The full recipient name and address remain available in the chosen-recipient control and transfer review.

Persistence check: bundle and run `scripts/person-avatar-smoke.ts` with esbuild. `preview.tsx` exports `renderAvatarPreview(host)` for a local visual review of all cells at 96, 44 and 32 px; it is not imported by production screens.

The browser loads `exm-portraits-v2.webp`, a lossless encoding of the source atlas with identical decoded RGBA pixels.
