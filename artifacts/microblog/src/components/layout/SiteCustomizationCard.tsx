import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateSiteSettings,
  getGetSiteSettingsQueryKey,
  type SiteSettings,
  type UpdateSiteSettingsBody,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_PALETTE_ID,
  DEFAULT_THEME_ID,
  PALETTES,
  PALETTE_COLOR_KEYS,
  THEMES,
  getPalette,
  smartMergePalette,
  type PaletteColors,
} from "@/lib/site-themes";

const HSL_DEFAULTS: PaletteColors = {
  ...getPalette(DEFAULT_PALETTE_ID)!.colors,
};

const TEXT_DEFAULTS = {
  siteTitle: "Chris Fornesa",
  heroHeading: "Buenas at Kumusta!",
  heroSubheading:
    "Welcome to my digital garden where I cultivate my thoughts, feelings, hopes, dreams, and more.",
  aboutHeading: "About This Platform",
  aboutBody:
    "A space where I share my thoughts, ideas, and experiences with the world. Built with React using Replit, Claude Code, Codex, and Gemini CLI.",
  copyrightLine: "Chris Fornesa",
  footerCredit: "Built with React using Replit, Claude Code, Codex, and Gemini CLI.",
  ctaLabel: "Learn More About Me",
  ctaHref: "/users/@cfornesa",
} as const;

const COLOR_FIELDS: Array<{
  key: keyof PaletteColors;
  label: string;
  helper?: string;
}> = [
  { key: "colorBackground", label: "Background (Light)" },
  { key: "colorForeground", label: "Foreground (Light)" },
  { key: "colorBackgroundDark", label: "Background (Dark)" },
  { key: "colorForegroundDark", label: "Foreground (Dark)" },
  { key: "colorPrimary", label: "Primary" },
  { key: "colorPrimaryForeground", label: "Primary text" },
  { key: "colorSecondary", label: "Secondary" },
  { key: "colorSecondaryForeground", label: "Secondary text" },
  { key: "colorAccent", label: "Accent" },
  { key: "colorAccentForeground", label: "Accent text" },
  { key: "colorMuted", label: "Muted" },
  { key: "colorMutedForeground", label: "Muted text" },
  { key: "colorDestructive", label: "Destructive" },
  { key: "colorDestructiveForeground", label: "Destructive text" },
];

const PREVIEW_SWATCH_KEYS: Array<keyof PaletteColors> = [
  "colorBackground",
  "colorForeground",
  "colorPrimary",
  "colorSecondary",
  "colorAccent",
  "colorMuted",
  "colorDestructive",
];

function parseHsl(input: string): { h: number; s: number; l: number } | null {
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function formatHsl(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

function hslToHex(input: string): string {
  const parsed = parseHsl(input);
  if (!parsed) return "#000000";
  const { h, s, l } = parsed;
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return formatHsl(0, 0, 0);
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return formatHsl(h, s * 100, l * 100);
}

type FormState = Record<string, string>;

function buildInitialState(settings: SiteSettings): FormState {
  return {
    theme: settings.theme,
    palette: settings.palette,
    siteTitle: settings.siteTitle,
    heroHeading: settings.heroHeading,
    heroSubheading: settings.heroSubheading,
    aboutHeading: settings.aboutHeading,
    aboutBody: settings.aboutBody,
    copyrightLine: settings.copyrightLine,
    footerCredit: settings.footerCredit,
    ctaLabel: settings.ctaLabel,
    ctaHref: settings.ctaHref,
    colorBackground: settings.colorBackground,
    colorForeground: settings.colorForeground,
    colorBackgroundDark: settings.colorBackgroundDark,
    colorForegroundDark: settings.colorForegroundDark,
    colorPrimary: settings.colorPrimary,
    colorPrimaryForeground: settings.colorPrimaryForeground,
    colorSecondary: settings.colorSecondary,
    colorSecondaryForeground: settings.colorSecondaryForeground,
    colorAccent: settings.colorAccent,
    colorAccentForeground: settings.colorAccentForeground,
    colorMuted: settings.colorMuted,
    colorMutedForeground: settings.colorMutedForeground,
    colorDestructive: settings.colorDestructive,
    colorDestructiveForeground: settings.colorDestructiveForeground,
  };
}

interface SiteCustomizationCardProps {
  settings: SiteSettings;
}

export function SiteCustomizationCard({ settings }: SiteCustomizationCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => buildInitialState(settings));
  const [baseline, setBaseline] = useState<FormState>(() => buildInitialState(settings));
  // Tracks the palette id we last smart-merged FROM, so palette swaps can tell
  // which color fields are still "stock" vs custom-edited by the owner.
  const lastPaletteRef = useRef<string>(settings.palette);

  const isDirty = useMemo(() => {
    return Object.keys(form).some((k) => form[k] !== baseline[k]);
  }, [form, baseline]);

  // Only adopt server state when the user has no unsaved edits — never
  // clobber in-progress work just because React Query refetched.
  useEffect(() => {
    const next = buildInitialState(settings);
    setBaseline(next);
    if (!isDirty) {
      setForm(next);
      lastPaletteRef.current = settings.palette;
    }
    // We intentionally exclude `isDirty` from deps: we want this to fire on
    // every new server snapshot and check dirty state at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const update = useUpdateSiteSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSiteSettingsQueryKey() });
        toast({ title: "Site settings saved", description: "Your changes are live." });
      },
      onError: (error: any) => {
        const message = error?.response?.data?.error || "Failed to save site settings";
        toast({ title: "Error", description: message, variant: "destructive" });
      },
    },
  });

  const setField = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setColorFromHex = (key: string, hex: string) =>
    setField(key, hexToHsl(hex));

  const handlePickTheme = (themeId: string) => {
    setForm((prev) => ({ ...prev, theme: themeId }));
  };

  const handlePickPalette = (nextPaletteId: string) => {
    setForm((prev) => {
      const merged = smartMergePalette(prev, lastPaletteRef.current, nextPaletteId);
      lastPaletteRef.current = nextPaletteId;
      return { ...merged, palette: nextPaletteId };
    });
  };

  const handleResetDefaults = () => {
    const next = {
      ...TEXT_DEFAULTS,
      ...HSL_DEFAULTS,
      theme: DEFAULT_THEME_ID,
      palette: DEFAULT_PALETTE_ID,
    };
    setForm(next);
    lastPaletteRef.current = DEFAULT_PALETTE_ID;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({ data: form as UpdateSiteSettingsBody });
  };

  const activePalette = getPalette(form.palette);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Customization</CardTitle>
        <CardDescription>
          Owner-only. Pick a theme and palette, fine-tune any color or copy. Changes apply
          everywhere as soon as you save.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-8">
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Theme & Palette
            </h3>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <Label className="text-xs font-semibold uppercase tracking-wide">Theme</Label>
                <p className="text-xs text-muted-foreground">
                  Borders, fonts, shadows, radius
                </p>
              </div>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                {THEMES.map((theme) => {
                  const selected = form.theme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handlePickTheme(theme.id)}
                      aria-pressed={selected}
                      className={`text-left rounded-md border p-3 transition-colors ${
                        selected
                          ? "border-foreground bg-accent/40"
                          : "border-border bg-background hover:bg-muted/40"
                      }`}
                    >
                      <div className="text-sm font-semibold">{theme.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {theme.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <Label className="text-xs font-semibold uppercase tracking-wide">Palette</Label>
                <p className="text-xs text-muted-foreground">
                  14 colors — custom edits below are preserved
                </p>
              </div>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {PALETTES.map((palette) => {
                  const selected = form.palette === palette.id;
                  return (
                    <button
                      key={palette.id}
                      type="button"
                      onClick={() => handlePickPalette(palette.id)}
                      aria-pressed={selected}
                      className={`text-left rounded-md border p-3 transition-colors ${
                        selected
                          ? "border-foreground bg-accent/40"
                          : "border-border bg-background hover:bg-muted/40"
                      }`}
                    >
                      <div className="text-sm font-semibold">{palette.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {palette.description}
                      </div>
                      <div className="mt-2 flex gap-1">
                        {PREVIEW_SWATCH_KEYS.map((k) => (
                          <span
                            key={k}
                            className="inline-block h-4 w-4 rounded-full border border-border"
                            style={{ backgroundColor: `hsl(${palette.colors[k]})` }}
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              {activePalette && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Live palette preview
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PREVIEW_SWATCH_KEYS.map((k) => (
                      <div key={k} className="flex items-center gap-2">
                        <span
                          className="inline-block h-6 w-6 rounded-full border border-border"
                          style={{ backgroundColor: `hsl(${form[k] ?? activePalette.colors[k]})` }}
                          aria-hidden="true"
                        />
                        <span className="text-xs font-mono text-muted-foreground">
                          {k.replace(/^color/, "").replace(/Foreground$/, "")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Identity & Copy
            </h3>

            <div className="space-y-2">
              <Label htmlFor="siteTitle">Site title</Label>
              <Input
                id="siteTitle"
                value={form.siteTitle}
                onChange={(e) => setField("siteTitle", e.target.value)}
                maxLength={255}
              />
              <p className="text-xs text-muted-foreground">
                Shown in the navbar and the browser tab.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="heroHeading">Hero heading</Label>
                <Input
                  id="heroHeading"
                  value={form.heroHeading}
                  onChange={(e) => setField("heroHeading", e.target.value)}
                  maxLength={255}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ctaLabel">Hero button label</Label>
                <Input
                  id="ctaLabel"
                  value={form.ctaLabel}
                  onChange={(e) => setField("ctaLabel", e.target.value)}
                  maxLength={255}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="heroSubheading">Hero subheading</Label>
              <Textarea
                id="heroSubheading"
                value={form.heroSubheading}
                onChange={(e) => setField("heroSubheading", e.target.value)}
                className="resize-none h-20"
                maxLength={1000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ctaHref">Hero button link</Label>
              <Input
                id="ctaHref"
                value={form.ctaHref}
                onChange={(e) => setField("ctaHref", e.target.value)}
                maxLength={2048}
                placeholder="/users/@yourhandle"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="aboutHeading">"About" heading</Label>
              <Input
                id="aboutHeading"
                value={form.aboutHeading}
                onChange={(e) => setField("aboutHeading", e.target.value)}
                maxLength={255}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="aboutBody">"About" body</Label>
              <Textarea
                id="aboutBody"
                value={form.aboutBody}
                onChange={(e) => setField("aboutBody", e.target.value)}
                className="resize-none h-28"
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground">
                Shown in the right sidebar on the home page. Line breaks are preserved.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="copyrightLine">Copyright name</Label>
                <Input
                  id="copyrightLine"
                  value={form.copyrightLine}
                  onChange={(e) => setField("copyrightLine", e.target.value)}
                  maxLength={255}
                />
                <p className="text-xs text-muted-foreground">
                  Renders as: "© {new Date().getFullYear()} {form.copyrightLine}."
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="footerCredit">Footer credit</Label>
                <Input
                  id="footerCredit"
                  value={form.footerCredit}
                  onChange={(e) => setField("footerCredit", e.target.value)}
                  maxLength={255}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Color Palette (per-field)
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Click a swatch to override any individual color. Edits here survive when you
                  switch palettes — only stock palette colors get replaced.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleResetDefaults}>
                Reset to Bauhaus defaults
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map((field) => {
                const value = form[field.key] ?? "";
                const hex = hslToHex(value);
                return (
                  <div
                    key={field.key}
                    className="flex items-center gap-3 rounded-md border border-border p-3"
                  >
                    <input
                      type="color"
                      value={hex}
                      onChange={(e) => setColorFromHex(field.key, e.target.value)}
                      className="h-10 w-12 cursor-pointer rounded border border-border bg-transparent"
                      aria-label={field.label}
                    />
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs font-medium" htmlFor={`color-${field.key}`}>
                        {field.label}
                      </Label>
                      <Input
                        id={`color-${field.key}`}
                        value={value}
                        onChange={(e) => setField(field.key, e.target.value)}
                        placeholder="0 100% 50%"
                        className="h-8 text-xs font-mono mt-1"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </CardContent>
        <CardFooter className="flex justify-between border-t p-6">
          <p className="text-xs text-muted-foreground">
            {isDirty ? "You have unsaved changes." : "All changes saved."}
          </p>
          <Button type="submit" disabled={update.isPending || !isDirty}>
            {update.isPending ? "Saving..." : "Save site settings"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
