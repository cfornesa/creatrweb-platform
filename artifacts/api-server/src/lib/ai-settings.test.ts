import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_VENDOR_OPTIONS,
  decryptAiApiKey,
  encryptAiApiKey,
  getAiVendorLabel,
  normalizeAiVendorSettingsInput,
  toSafeAiSettingsResponse,
  validateAiVendorSettingsInput,
} from "./ai-settings";

describe("ai-settings", () => {
  beforeEach(() => {
    process.env.AI_SETTINGS_ENCRYPTION_KEY = "12345678901234567890123456789012";
  });

  it("exposes the stable vendor set with human-readable labels", () => {
    expect(AI_VENDOR_OPTIONS).toEqual([
      { id: "openrouter", label: "OpenRouter" },
      { id: "opencode-zen", label: "Opencode Zen" },
      { id: "opencode-go", label: "Opencode Go" },
      { id: "google", label: "Google" },
    ]);
  });

  it("normalizes and trims incoming vendor settings input", () => {
    expect(
      normalizeAiVendorSettingsInput({
        vendor: " opencode-zen ",
        enabled: true,
        model: " big-pickle ",
        apiKey: " sk-123 ",
      }),
    ).toEqual({
      vendor: "opencode-zen",
      enabled: true,
      model: "big-pickle",
      apiKey: "sk-123",
    });
  });

  it("requires a model and api key when a vendor is enabled", () => {
    expect(
      validateAiVendorSettingsInput({
        vendorLabel: "OpenCode Zen",
        enabled: true,
        model: null,
        encryptedApiKey: null,
      }),
    ).toBe("OpenCode Zen requires a model before it can be enabled");
    expect(
      validateAiVendorSettingsInput({
        vendorLabel: "OpenCode Zen",
        enabled: true,
        model: "big-pickle",
        encryptedApiKey: null,
      }),
    ).toBe("OpenCode Zen requires an API key before it can be enabled");
  });

  it("returns disabled-by-default safe settings for every supported vendor", () => {
    expect(toSafeAiSettingsResponse([])).toEqual({
      availableVendors: AI_VENDOR_OPTIONS,
      settings: [
        {
          vendor: "openrouter",
          vendorLabel: "OpenRouter",
          enabled: false,
          configured: false,
          model: null,
        },
        {
          vendor: "opencode-zen",
          vendorLabel: "Opencode Zen",
          enabled: false,
          configured: false,
          model: null,
        },
        {
          vendor: "opencode-go",
          vendorLabel: "Opencode Go",
          enabled: false,
          configured: false,
          model: null,
        },
        {
          vendor: "google",
          vendorLabel: "Google",
          enabled: false,
          configured: false,
          model: null,
        },
      ],
    });
  });

  it("never exposes encrypted api keys in the safe response", () => {
    const response = toSafeAiSettingsResponse([
      {
        vendor: "openrouter",
        enabled: 1,
        model: "anthropic/claude-sonnet-4.5",
        encryptedApiKey: "secret-payload",
      },
    ]);

    expect(response.settings[0]).toEqual({
      vendor: "openrouter",
      vendorLabel: "OpenRouter",
      enabled: true,
      configured: true,
      model: "anthropic/claude-sonnet-4.5",
    });
    expect("encryptedApiKey" in response.settings[0]!).toBe(false);
  });

  it("encrypts and decrypts api keys round-trip", () => {
    const encrypted = encryptAiApiKey("my-real-api-key");
    expect(encrypted).not.toContain("my-real-api-key");
    expect(decryptAiApiKey(encrypted)).toBe("my-real-api-key");
  });

  it("maps stable vendor ids to frontend labels", () => {
    expect(getAiVendorLabel("opencode-go")).toBe("Opencode Go");
    expect(getAiVendorLabel("openrouter")).toBe("OpenRouter");
    expect(getAiVendorLabel("not-real")).toBeNull();
  });
});
