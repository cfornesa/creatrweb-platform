import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateMe,
  getGetMeQueryKey,
  getGetUserQueryKey,
  type UpdateUserProfileBody,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ThemePalettePicker } from "@/components/layout/ThemePalettePicker";
import {
  PALETTE_COLOR_KEYS,
  getPalette,
  smartMergePalette,
  type PaletteColors,
} from "@/lib/site-themes";
import type { SiteSettings } from "@workspace/api-client-react";

const THEME_FIELD_KEYS = [
  "theme",
  "palette",
  ...PALETTE_COLOR_KEYS,
] as const;

type ThemeFieldKey = typeof THEME_FIELD_KEYS[number];

type FormState = Record<ThemeFieldKey, string>;

function extractErrorMessage(error: unknown): string | null {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: unknown }).response;
    if (response && typeof response === "object" && "data" in response) {
      const data = (response as { data?: unknown }).data;
      if (data && typeof data === "object" && "error" in data) {
        const message = (data as { error?: unknown }).error;
        if (typeof message === "string") return message;
      }
    }
  }
  return null;
}

/**
 * Structural type describing every theme-related field this card reads.
 * Both `UserProfile` (from /api/users/:id) and `CurrentUser` (from
 * /api/users/me) satisfy it, so the card works for both call sites
 * without `any` casts.
 */
export type UserWithTheme = {
  id: string;
  username?: string | null;
  theme?: string | null;
  palette?: string | null;
  colorBackground?: string | null;
  colorForeground?: string | null;
  colorBackgroundDark?: string | null;
  colorForegroundDark?: string | null;
  colorPrimary?: string | null;
  colorPrimaryForeground?: string | null;
  colorSecondary?: string | null;
  colorSecondaryForeground?: string | null;
  colorAccent?: string | null;
  colorAccentForeground?: string | null;
  colorMuted?: string | null;
  colorMutedForeground?: string | null;
  colorDestructive?: string | null;
  colorDestructiveForeground?: string | null;
};

function buildInitialState(user: UserWithTheme, siteSettings: SiteSettings): FormState {
  // Wherever the user has not chosen a value, fall back to the owner's
  // current site-wide value. That keeps the picker visually meaningful
  // before any save and makes "reset to site defaults" obvious.
  const out = {} as FormState;
  const userRec = user as unknown as Record<string, unknown>;
  const siteRec = siteSettings as unknown as Record<string, unknown>;
  out.theme = (userRec.theme as string | null | undefined) ?? siteSettings.theme;
  out.palette = (userRec.palette as string | null | undefined) ?? siteSettings.palette;
  for (const key of PALETTE_COLOR_KEYS) {
    const userValue = userRec[key];
    const siteValue = siteRec[key];
    out[key] = (userValue as string | null | undefined) ?? (siteValue as string) ?? "";
  }
  return out;
}

function pickColors(form: FormState): PaletteColors {
  const out: Record<string, string> = {};
  for (const key of PALETTE_COLOR_KEYS) {
    out[key] = form[key] ?? "";
  }
  return out as unknown as PaletteColors;
}

interface UserPageCustomizationCardProps {
  user: UserWithTheme;
  siteSettings: SiteSettings;
}

/**
 * Per-user theme picker. Lets any signed-in user theme their own profile
 * page using the same 9 themes / 9 palettes / 14 colors that power the
 * owner's site-wide customization.
 *
 * Saves go to PATCH /users/me. Theme fields are sent only when this card
 * is submitted, so saving "Profile Information" never wipes a user's
 * saved theme.
 */
export function UserPageCustomizationCard({ user, siteSettings }: UserPageCustomizationCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => buildInitialState(user, siteSettings));
  const [baseline, setBaseline] = useState<FormState>(() => buildInitialState(user, siteSettings));
  // Track the palette id we last smart-merged FROM, so swaps can keep any
  // custom edits the user has made.
  const lastPaletteRef = useRef<string>(form.palette);

  const isDirty = useMemo(
    () => Object.keys(form).some((k) => form[k as ThemeFieldKey] !== baseline[k as ThemeFieldKey]),
    [form, baseline],
  );

  useEffect(() => {
    const next = buildInitialState(user, siteSettings);
    setBaseline(next);
    if (!isDirty) {
      setForm(next);
      lastPaletteRef.current = next.palette;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, siteSettings]);

  // Whether the user currently has any saved per-profile theme value at
  // all. Used to enable/disable the "Clear my customization" action so we
  // don't fire a no-op PATCH when the user is already inheriting the site
  // theme.
  const hasSavedCustomization = useMemo(() => {
    const rec = user as unknown as Record<string, unknown>;
    return THEME_FIELD_KEYS.some((key) => {
      const v = rec[key];
      return typeof v === "string" && v.length > 0;
    });
  }, [user]);

  const invalidateUserQueries = () => {
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    if (user.username) {
      queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(user.username) });
    }
    queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(user.id) });
  };

  const update = useUpdateMe({
    mutation: {
      onSuccess: () => {
        invalidateUserQueries();
        toast({
          title: "Profile theme saved",
          description: "Visit your profile to see the changes.",
        });
      },
      onError: (error: unknown) => {
        const message = extractErrorMessage(error) ?? "Failed to save profile theme";
        toast({ title: "Error", description: message, variant: "destructive" });
      },
    },
  });

  const clear = useUpdateMe({
    mutation: {
      onSuccess: () => {
        invalidateUserQueries();
        // After clearing, snap the in-memory form back to the current
        // site values so the picker stops showing the old custom edits.
        const next = buildInitialState({ ...user, theme: null, palette: null }, siteSettings);
        for (const key of PALETTE_COLOR_KEYS) {
          (next as Record<string, string>)[key] = (
            siteSettings as unknown as Record<string, string>
          )[key] ?? "";
        }
        setForm(next);
        setBaseline(next);
        lastPaletteRef.current = next.palette;
        toast({
          title: "Profile theme cleared",
          description: "Your profile now follows the site theme.",
        });
      },
      onError: (error: unknown) => {
        const message = extractErrorMessage(error) ?? "Failed to clear profile theme";
        toast({ title: "Error", description: message, variant: "destructive" });
      },
    },
  });

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

  const handleResetToSite = () => {
    // In-memory only: snap the form back to the current site values so
    // the user can see what "no customization" looks like before deciding
    // what to do next. This does NOT touch the server — saving from this
    // state would just write the current site values into the user's row
    // (still customized, just identical to the site today). To actually
    // wipe the saved customization so the profile keeps following the
    // site theme into the future, use the dedicated "Clear my
    // customization" action below, which PATCHes nulls.
    const next = buildInitialState({ ...user, theme: null, palette: null }, siteSettings);
    setForm(next);
    lastPaletteRef.current = next.palette;
  };

  const handleChangeColor = (key: keyof PaletteColors, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: UpdateUserProfileBody = {};
    for (const key of THEME_FIELD_KEYS) {
      const value = form[key];
      if (typeof value === "string" && value.length > 0) {
        (payload as Record<string, string>)[key] = value;
      }
    }
    update.mutate({ data: payload });
  };

  const handleClearCustomization = () => {
    // Send explicit nulls for every theme column so the API resets the
    // user's row, making the profile inherit the current (and future)
    // site theme.
    const payload: UpdateUserProfileBody = {};
    for (const key of THEME_FIELD_KEYS) {
      (payload as Record<string, null>)[key] = null;
    }
    clear.mutate({ data: payload });
  };

  const isBusy = update.isPending || clear.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Page Theme</CardTitle>
        <CardDescription>
          Customize how your profile page (/users/@{user.username || "you"}) looks. Pick a
          theme and palette, fine-tune any color. Only your profile content uses these — the
          navbar and footer stay on the site theme.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <ThemePalettePicker
            theme={form.theme}
            palette={form.palette}
            colors={pickColors(form)}
            onPickTheme={handlePickTheme}
            onPickPalette={handlePickPalette}
            onChangeColor={handleChangeColor}
            onResetDefaults={handleResetToSite}
            resetLabel="Reset form to site defaults"
          />
          <div className="rounded-md border border-dashed border-border p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Clear my customization</p>
              <p className="text-xs text-muted-foreground">
                {hasSavedCustomization
                  ? "Wipes your saved profile theme so it follows the site theme — including any future site theme changes."
                  : "Your profile is already inheriting the site theme."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleClearCustomization}
              disabled={isBusy || !hasSavedCustomization}
            >
              {clear.isPending ? "Clearing..." : "Clear my customization"}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t p-6">
          <p className="text-xs text-muted-foreground">
            {isDirty ? "You have unsaved changes." : "All changes saved."}
          </p>
          <Button type="submit" disabled={isBusy || !isDirty}>
            {update.isPending ? "Saving..." : "Save profile theme"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
