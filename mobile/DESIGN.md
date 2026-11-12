# Mobile design system

The source of truth is [`src/lib/theme.ts`](src/lib/theme.ts). Screens import
components and tokens; they do not define their own colours, font sizes, or
radii.

## Tokens

- **Colour**: zinc surfaces (`#0a0a0a` background, `#171717` cards,
  `#262626` raised), `foreground/10` borders, emerald `#059669` accent,
  `#34d399` readable accent text in dark mode, and the dashboard's
  success/warning/danger/info palette. `accentText` is for links, icons, and
  labels; `accent` is for filled controls.
- **Type**: Geist Sans and Geist Mono, with named ramp steps (`display`,
  `title`, `readout`, `heading`, `body`, `label`, `caption`, `micro`, and
  mono variants). No raw `fontSize` values outside the theme.
- **Spacing**: 4-point grid (`xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 20,
  `xxl` 28, `xxxl` 36). Screen edge padding is `xl`. Optical 1–3px gaps
  inside a text lockup are the only inline spacing values.
- **Radius**: `xs` 2, `sm` 6, `md` 8, `lg` 10, `xl` 14, `xxl` 18, and
  `pill`. Non-capsule corners use `borderCurve: "continuous"`.
- **Motion**: press feedback is instant; no entrance animation on routine
  screens. Haptics only confirm scan and load outcomes.

## Components

- `AppButton` owns the four variants (`primary`, `secondary`, `ghost`,
  `danger`), three sizes, pressed/disabled/loading states, and the 44pt
  minimum touch target.
- `TextField` owns input chrome, focus ring, label, hint, and error text.
- `SpoolCard`, `PrinterRackRow`, `StatReadout`, `MetaLine`, and `ShelfRule`
  compose the shelf/rack surface.
- `EmptyState`, `Skeleton`, `Badge`, `ColorDot`, `ProgressBar`, and
  `BrandMark` cover the remaining shared states.
- Screen-specific compositions live in `src/components/`, never in
  `src/app/` route files.

## Deliberate exceptions

- **Custom app-shell header**: the tabs hide the native header and use
  `PageHeader` to keep the dashboard's "Open Print" mark and title rhythm.
  This is a product-parity decision; native stack headers remain the default
  for pushed screens.
- **Ionicons across platforms**: the dashboard uses a single line-icon
  language, so the app keeps one icon family instead of mixing SF Symbols
  and Material icons.
- **Custom palette instead of platform semantic colours**: the dashboard is
  the product's design source, and its zinc/emerald tokens must match
  exactly. Light and dark are derived as explicit pairs.
- **JS tab bar instead of `NativeTabs`**: the bar uses the dashboard's
  surface, border, and emerald tokens so both clients share one shell. It is
  a standard bottom bar, not a floating custom pill.
- **Fixed emerald accent**: the dashboard accent selector is not mirrored in
  the mobile app yet.
