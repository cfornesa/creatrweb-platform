import { describe, expect, it } from "vitest";
import {
  PALETTE_COLOR_KEYS,
  getPalette,
  smartMergePalette,
  type PaletteColors,
} from "@/lib/site-themes";

function colorsOf(id: string): PaletteColors {
  const palette = getPalette(id);
  if (!palette) throw new Error(`Unknown palette in test fixture: ${id}`);
  return palette.colors;
}

describe("smartMergePalette", () => {
  it("(a) all-stock case: replaces every color when none are customized", () => {
    const bauhaus = colorsOf("bauhaus");
    const ocean = colorsOf("ocean");

    const form = { ...bauhaus, palette: "bauhaus" };
    const result = smartMergePalette(form, "bauhaus", "ocean");

    for (const key of PALETTE_COLOR_KEYS) {
      expect(result[key]).toBe(ocean[key]);
    }
  });

  it("(b) single field customized: only that field survives, others swap", () => {
    const bauhaus = colorsOf("bauhaus");
    const ocean = colorsOf("ocean");
    const customPrimary = "123 45% 67%";

    const form: PaletteColors = { ...bauhaus, colorPrimary: customPrimary };
    const result = smartMergePalette(form, "bauhaus", "ocean");

    expect(result.colorPrimary).toBe(customPrimary);
    for (const key of PALETTE_COLOR_KEYS) {
      if (key === "colorPrimary") continue;
      expect(result[key]).toBe(ocean[key]);
    }
  });

  it("(c) unknown previous palette id: full adopt of the new palette", () => {
    const ocean = colorsOf("ocean");
    // Form has values that don't match any known palette — represent a
    // server-stored custom palette id we no longer recognise.
    const form: PaletteColors = {
      colorBackground: "10 10% 10%",
      colorForeground: "20 20% 20%",
      colorBackgroundDark: "30 30% 30%",
      colorForegroundDark: "40 40% 40%",
      colorPrimary: "50 50% 50%",
      colorPrimaryForeground: "60 60% 60%",
      colorSecondary: "70 70% 70%",
      colorSecondaryForeground: "80 80% 80%",
      colorAccent: "90 90% 90%",
      colorAccentForeground: "100 50% 50%",
      colorMuted: "110 50% 50%",
      colorMutedForeground: "120 50% 50%",
      colorDestructive: "130 50% 50%",
      colorDestructiveForeground: "140 50% 50%",
    };

    const result = smartMergePalette(form, "totally-unknown-id", "ocean");

    for (const key of PALETTE_COLOR_KEYS) {
      expect(result[key]).toBe(ocean[key]);
    }
  });

  it("(d) all fields customized: no fields change on palette swap", () => {
    const customForm: PaletteColors = {
      colorBackground: "11 22% 33%",
      colorForeground: "12 22% 33%",
      colorBackgroundDark: "13 22% 33%",
      colorForegroundDark: "14 22% 33%",
      colorPrimary: "15 22% 33%",
      colorPrimaryForeground: "16 22% 33%",
      colorSecondary: "17 22% 33%",
      colorSecondaryForeground: "18 22% 33%",
      colorAccent: "19 22% 33%",
      colorAccentForeground: "20 22% 33%",
      colorMuted: "21 22% 33%",
      colorMutedForeground: "22 22% 33%",
      colorDestructive: "23 22% 33%",
      colorDestructiveForeground: "24 22% 33%",
    };

    const result = smartMergePalette(customForm, "bauhaus", "ocean");

    for (const key of PALETTE_COLOR_KEYS) {
      expect(result[key]).toBe(customForm[key]);
    }
  });

  it("preserves non-palette form fields untouched", () => {
    const bauhaus = colorsOf("bauhaus");
    const form = {
      ...bauhaus,
      siteTitle: "My Site",
      heroHeading: "Hello",
      palette: "bauhaus",
    };

    const result = smartMergePalette(form, "bauhaus", "ocean");

    expect(result.siteTitle).toBe("My Site");
    expect(result.heroHeading).toBe("Hello");
    expect(result.palette).toBe("bauhaus");
  });

  it("returns the form unchanged when next palette id is unknown", () => {
    const bauhaus = colorsOf("bauhaus");
    const form: PaletteColors = { ...bauhaus };

    const result = smartMergePalette(form, "bauhaus", "no-such-palette");

    for (const key of PALETTE_COLOR_KEYS) {
      expect(result[key]).toBe(bauhaus[key]);
    }
  });
});
