import type { CSSProperties } from "react";
import type { PaletteColors, ThemeId } from "@/lib/site-themes";

/**
 * Tiny live preview of a theme — a stand-in "card + heading + button" that
 * reads the theme's structural CSS variables (font family, weight, heading
 * transform, border width, shadow, radius) and the supplied palette colors.
 *
 * Two important details:
 *  - We set `data-theme={themeId}` on the wrapper so the `[data-theme="..."]`
 *    rules in `index.css` cascade their structural variables onto this
 *    subtree only — no global side effects.
 *  - Palette CSS vars are pushed via inline `style` so the preview reflects
 *    the *draft* palette being edited in the form, not just whatever the
 *    server saved last.
 *
 * The preview is non-interactive (`aria-hidden`, no buttons or anchors) so it
 * is safe to nest inside the parent `<button>` that selects the theme.
 *
 * Static visual rules (font, border, shadow, radius bindings) live in
 * `index.css` under the `.theme-preview-*` classes so this component only
 * needs to push the dynamic palette values — no inline `var(...)` strings
 * that would fight `React.CSSProperties` typings.
 */

// CSS custom properties aren't part of the standard CSSProperties typing.
// Add a typed map of `--name` keys so the inline style stays type-checked.
type CssVarMap = Record<`--${string}`, string>;
type StyleWithCssVars = CSSProperties & CssVarMap;

interface ThemePreviewTileProps {
  themeId: ThemeId;
  palette: PaletteColors;
}

export function ThemePreviewTile({ themeId, palette }: ThemePreviewTileProps) {
  // Match the runtime CSS-var contract that ThemeInjector writes — but only
  // for this scoped element. `--border` mirrors the foreground because that's
  // what the global theme does for the bauhaus-style tricolor scheme; for the
  // softer themes it still produces a sensible thin line.
  const paletteVars: StyleWithCssVars = {
    "--background": palette.colorBackground,
    "--foreground": palette.colorForeground,
    "--card": palette.colorBackground,
    "--card-foreground": palette.colorForeground,
    "--primary": palette.colorPrimary,
    "--primary-foreground": palette.colorPrimaryForeground,
    "--secondary": palette.colorSecondary,
    "--secondary-foreground": palette.colorSecondaryForeground,
    "--accent": palette.colorAccent,
    "--accent-foreground": palette.colorAccentForeground,
    "--muted": palette.colorMuted,
    "--muted-foreground": palette.colorMutedForeground,
    "--border": palette.colorForeground,
  };

  return (
    <div
      data-theme={themeId}
      aria-hidden="true"
      className="theme-preview-root"
      style={paletteVars}
    >
      <div className="theme-preview-card">
        <div>
          <div className="theme-preview-heading">Aa Bb</div>
          <div className="theme-preview-subtext">The quick brown fox.</div>
        </div>
        <div className="theme-preview-row">
          <span className="theme-preview-button">Read</span>
          <span className="theme-preview-avatar" />
        </div>
      </div>
    </div>
  );
}
