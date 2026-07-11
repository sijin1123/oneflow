# OneFlow Generated Visual Assets

## Provenance policy

OneFlow uses generated raster art only where code-native icons and CSS cannot provide the intended low-frequency emotional atmosphere. Functional icons remain `lucide-react` or in-repository React/SVG components. No reference-product screenshots, assets, logos, or trade dress are used as inputs.

## `oneflow-empty-flow.png`

| Field | Value |
|---|---|
| Path | `apps/web/src/assets/generated/oneflow-empty-flow.png` |
| Tool | Built-in `image_gen` workflow (`gpt-image-2` path managed by Codex) |
| Created | 2026-07-11 |
| Dimensions | 720 x 540 RGB PNG (project delivery resized from the generated 1448 x 1086 source) |
| SHA-256 | `536a557d282c93a933c6f004c92ea9a3cff2194db725b8744d1beedd004abd94` |
| Intended use | Search-zero and selected high-value empty states |
| Current consumer | `components/shell/states.tsx`, opt-in `visual="illustration"`; used by `/work-items` empty/search-zero state |
| Accessibility | Decorative `alt=""`; adjacent title and hint carry all meaning; lazy loaded |
| External inputs | None |
| License/provenance | Original AI-generated project asset; no third-party bitmap or reference image used |

Final prompt:

```text
Use case: stylized-concept
Asset type: OneFlow internal project-management product empty-state illustration
Primary request: Create one refined editorial 3D illustration that suggests work moving from scattered inputs into an orderly shared flow.
Scene/backdrop: clean near-white cool gray studio background, no horizon line, no gradients, no decorative blobs.
Subject: a small architectural arrangement of stacked paper planes as abstract folded documents, slim graphite rails, three understated task tiles, and a single mineral-green glassy path connecting them into an organized sequence. Include one tiny muted-coral priority marker and one restrained violet information marker for palette depth.
Style/medium: premium tactile paper-and-anodized-metal 3D editorial illustration, soft but precise, sophisticated enterprise software mood, original visual language.
Composition/framing: centered compact composition with generous clean padding on all sides, landscape 4:3, readable at 320px wide, no cropped objects.
Lighting/mood: quiet diffuse studio light, subtle grounded shadows, calm, capable, optimistic.
Color palette: cool graphite, porcelain white, mineral green, muted coral, restrained violet. Avoid dominant blue, purple gradients, beige, brown, orange-heavy palettes.
Materials/textures: matte paper, satin metal, a small amount of translucent colored acrylic.
Constraints: no text, no letters, no numbers, no logos, no people, no UI screenshot, no branded product resemblance, no Plane-like symbols, no watermark.
Avoid: gradient backgrounds, bokeh, floating spheres, oversized rounded cards, excessive gloss, fantasy imagery, clutter.
```

Visual verification:

- Subject and palette match the requested OneFlow visual language.
- No text, logo, watermark, person, UI screenshot, or reference-product mark is present.
- Composition remains legible at approximately 320px width and has clean padding.
- Image is intentionally opaque; no transparency or chroma-key post-processing was required.
- Runtime rendering is verified in the desktop and mobile empty-state screenshots listed in `docs/VERIFICATION.md`.
