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
import { ThemePalettePicker } from "@/components/layout/ThemePalettePicker";
import {
  DEFAULT_PALETTE_ID,
  DEFAULT_THEME_ID,
  PALETTE_COLOR_KEYS,
  getPalette,
  smartMergePalette,
  type PaletteColors,
} from "@/lib/site-themes";

const HSL_DEFAULTS: PaletteColors = {
  ...getPalette(DEFAULT_PALETTE_ID)!.colors,
};

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

function pickColors(form: FormState): PaletteColors {
  const out: Record<string, string> = {};
  for (const key of PALETTE_COLOR_KEYS) {
    out[key] = form[key] ?? "";
  }
  return out as unknown as PaletteColors;
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
    setForm((prev) => ({
      ...prev,
      ...HSL_DEFAULTS,
      theme: DEFAULT_THEME_ID,
      palette: DEFAULT_PALETTE_ID,
    }));
    lastPaletteRef.current = DEFAULT_PALETTE_ID;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({ data: form as UpdateSiteSettingsBody });
  };

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
          <ThemePalettePicker
            theme={form.theme}
            palette={form.palette}
            colors={pickColors(form)}
            onPickTheme={handlePickTheme}
            onPickPalette={handlePickPalette}
            onChangeColor={(key, value) => setField(key as string, value)}
            onResetDefaults={handleResetDefaults}
          />

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
