# Small narrative scenes

```tsx
import { SceneArt } from "../art/scenes"

<SceneArt variant="empty" size={144} />
<SceneArt variant="sent" size={144} />
```

`empty` belongs to a successfully loaded empty wallet/history state. `sent` belongs only to an actually confirmed transfer. Neither scene indicates loading, an error, an uncertain broadcast, or permission to sign a financial operation. Existing text must still state the actual financial status.

The default size is 144 CSS px; 120–160 px is the intended range. The component centers itself and uses an unmodified transparent PNG atlas. CSS selects the left/right square and adds a small inner inset so the figures, shoes, papers and airplane remain clear of adjacent UI. Both scenes share the same lower baseline. No background surface, status badge or animation is added.

The optional `label` supplies an accessible image name. Without it, the scene is decorative and hidden from assistive technology. `className` supports integration with the parent layout. `preview.tsx` exports `renderSceneArtPreview(host)` for local light/dark review; it is not imported by production screens.

Asset: `exm-scenes.png`, 1774 × 887 RGBA PNG, generated with the built-in imagegen tool on 18 November 2026. It contains two equal 887 × 887 cells. Full generation prompt: `PROMPT.md`. The welcome screen's chosen paper crystal and EXM mark are unchanged.

The browser loads `exm-scenes.webp`, a lossless encoding of the source atlas with identical decoded RGBA pixels.
