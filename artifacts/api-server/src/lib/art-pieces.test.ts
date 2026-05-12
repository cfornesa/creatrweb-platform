import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

vi.mock("@workspace/db", () => ({
  artPieceEngineSchema: z.enum(["p5", "c2", "three"]),
  artPieceStatusSchema: z.enum(["active", "archived"]),
}));

let helpers: typeof import("./art-pieces");

beforeAll(async () => {
  helpers = await import("./art-pieces");
});

describe("art piece helpers", () => {
  it("rejects aframe as an unsupported engine", () => {
    expect(helpers.validateArtPieceEngine("aframe")).toBeNull();
  });

  it("parses strict structured JSON generation output", () => {
    const parsed = helpers.parseStructuredArtPieceSpec(
      "p5",
      JSON.stringify({
        version: 1,
        title: "Orbit Bloom",
        notes: "Soft looping motion",
        canvas: {
          width: 640,
          height: 420,
          frameRate: 30,
        },
        background: "#f5f5f5",
        elements: [
          {
            type: "ellipse",
            x: 320,
            y: 210,
            width: 160,
            height: 120,
            fill: "#66ccff",
          },
        ],
      }),
    );

    expect(parsed.title).toBe("Orbit Bloom");
    expect("elements" in parsed && parsed.elements).toHaveLength(1);
  });

  it("compiles and preflights a structured sketch", () => {
    const code = helpers.compileStructuredArtPieceSpec("p5", {
      version: 1,
      title: "Orbit Bloom",
      notes: "",
      canvas: {
        width: 640,
        height: 420,
        frameRate: 30,
      },
      background: "#f5f5f5",
      elements: [
        {
          type: "ellipse",
          x: 320,
          y: 210,
          width: 160,
          height: 120,
          fill: "#66ccff",
          animation: {
            kind: "pulse",
            speed: 1,
          },
        },
      ],
    });

    expect(() => helpers.preflightCompiledArtPieceCode("p5", code)).not.toThrow();
  });

  it("compiles and preflights a c2 sketch", () => {
    const code = helpers.compileStructuredArtPieceSpec("c2", {
      version: 1,
      title: "Signal Study",
      notes: "",
      canvas: { width: 640, height: 420 },
      background: "#111111",
      elements: [
        {
          type: "circle",
          x: 320,
          y: 210,
          radius: 64,
          fill: "#66ccff",
        },
      ],
    });

    expect(() => helpers.preflightCompiledArtPieceCode("c2", code)).not.toThrow();
  });

  it("compiles and preflights a three scene", () => {
    const code = helpers.compileStructuredArtPieceSpec("three", {
      version: 1,
      title: "Orbit Mesh",
      notes: "",
      scene: {
        width: 800,
        height: 600,
        background: "#0f172a",
        camera: { fov: 60, position: { x: 0, y: 1.5, z: 6 } },
        ambientLight: "#ffffff",
        directionalLight: "#ffffff",
      },
      entities: [
        {
          type: "torusKnot",
          radius: 1.1,
          tube: 0.35,
          position: { x: 0, y: 0, z: 0 },
          color: "#a855f7",
        },
      ],
    });

    expect(code).toContain("camera.lookAt(0, 0, 0)");
    expect(() => helpers.preflightCompiledArtPieceCode("three", code)).not.toThrow();
  });

  it("normalizes a three box that uses scale instead of size", () => {
    const parsed = helpers.parseStructuredArtPieceSpec(
      "three",
      JSON.stringify({
        version: 1,
        title: "2050 Aero-Coupe Concept",
        notes: "Minimalist aerodynamic vehicle with floating glass chassis",
        scene: {
          width: 800,
          height: 600,
          background: "#1a1a2e",
          camera: {
            fov: 45,
            position: { x: 8, y: 4, z: 8 },
          },
          ambientLight: "#444466",
          directionalLight: "#ffffff",
        },
        entities: [
          {
            type: "box",
            position: { x: 0, y: 0.5, z: 0 },
            scale: { x: 3, y: 0.8, z: 1.5 },
            color: "#0f3460",
            animation: { kind: "float", speed: 1, amplitude: 0.2 },
          },
          {
            type: "sphere",
            position: { x: -1, y: 0.2, z: 1 },
            scale: { x: 0.5, y: 0.5, z: 0.5 },
            color: "#e94560",
          },
        ],
      }),
    );

    expect("entities" in parsed && parsed.entities[0]).toMatchObject({
      type: "box",
      size: { x: 3, y: 0.8, z: 1.5 },
    });
    expect("entities" in parsed && parsed.entities[1]).toMatchObject({
      type: "sphere",
      radius: 0.25,
    });
    expect("scene" in parsed && "camera" in parsed.scene && parsed.scene.camera.position).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      z: expect.any(Number),
    });
    expect(() =>
      helpers.preflightCompiledArtPieceCode(
        "three",
        helpers.compileStructuredArtPieceSpec("three", parsed),
      ),
    ).not.toThrow();
  });

  it("fails three schema validation with an entity-aware message for ambiguous box geometry", () => {
    expect(() =>
      helpers.parseStructuredArtPieceSpec(
        "three",
        JSON.stringify({
          version: 1,
          title: "Broken Coupe",
          notes: "",
          scene: {
            width: 800,
            height: 600,
            background: "#1a1a2e",
            camera: {
              fov: 45,
              position: { x: 8, y: 4, z: 8 },
            },
            ambientLight: "#444466",
            directionalLight: "#ffffff",
          },
          entities: [
            {
              type: "box",
              position: { x: 0, y: 0.5, z: 0 },
              color: "#0f3460",
            },
          ],
        }),
      ),
    ).toThrow("Three.js box entities require a size object { x, y, z }.");
  });

  it("issues and consumes validated draft tokens", () => {
    const draftToken = helpers.issueValidatedDraftToken({
      ownerUserId: "owner-1",
      title: "Orbit Bloom",
      prompt: "Make a glowing orbit bloom.",
      engine: "p5",
      htmlCode: null,
      cssCode: null,
      generatedCode: "(p) => { p.setup = () => { p.createCanvas(10, 10); }; p.draw = () => { p.background('#fff'); }; }",
      structuredSpec: {
        version: 1,
        title: "Orbit Bloom",
        notes: "",
        canvas: { width: 640, height: 420, frameRate: 30 },
        background: "#ffffff",
        elements: [
          { type: "ellipse", x: 100, y: 100, width: 50, height: 50, fill: "#00f" },
        ],
      },
      notes: null,
      generationVendor: "google",
      generationModel: "gemini-test",
      validationStatus: "validated",
      attemptCount: 2,
      maxAttempts: 5,
      vendorLabel: "Google",
      createdAt: Date.now(),
    });

    expect(helpers.consumeValidatedDraftToken(draftToken, "owner-1")?.attemptCount).toBe(2);
    expect(helpers.consumeValidatedDraftToken(draftToken, "owner-1")).toBeNull();
  });

  it("builds a live iframe embed snippet that resolves the current piece version", () => {
    expect(
      helpers.buildInteractivePieceIframeHtml({
        origin: "https://creatr.example",
        pieceId: 12,
        versionId: 34,
        title: "Orbit Bloom",
      }),
    ).toContain("/embed/pieces/12");
    expect(
      helpers.buildInteractivePieceIframeHtml({
        origin: "https://creatr.example",
        pieceId: 12,
        versionId: 34,
        title: "Orbit Bloom",
      }),
    ).not.toContain("?version=");
  });
});
