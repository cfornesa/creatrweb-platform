import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("three", () => {
  class Vector3 {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  }

  class Object3D {}

  class Scene extends Object3D {
    children: unknown[] = [];
    add(...objects: unknown[]) {
      this.children.push(...objects);
      return this;
    }
  }

  class Camera extends Object3D {}

  class PerspectiveCamera extends Camera {
    position = new Vector3();
    lookAt(_x: number, _y: number, _z: number) {}
    updateMatrixWorld(_force?: boolean) {}
    constructor(_fov: number, _aspect: number, _near: number, _far: number) {
      super();
    }
  }

  class WebGLRenderer {
    constructor(_input: unknown) {}
    render(_scene: unknown, _camera: unknown) {}
  }

  class Mesh extends Object3D {
    position = new Vector3();
    geometry: { parameters?: Record<string, unknown> };
    material: unknown;
    constructor(geometry: { parameters?: Record<string, unknown> }, material: unknown) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }

  class BoxGeometry {
    parameters = { width: 3, height: 1, depth: 1.5 };
  }

  class MeshStandardMaterial {
    constructor(_input: unknown) {}
  }

  return {
    Scene,
    Camera,
    PerspectiveCamera,
    WebGLRenderer,
    Mesh,
    BoxGeometry,
    MeshStandardMaterial,
  };
});

import { ThreePieceRenderer } from "../ThreePieceRenderer";

describe("3D piece renderers", () => {
  it("marks a three preview invalid when no mesh is rendered", async () => {
    const onStatusChange = vi.fn();
    render(
      <ThreePieceRenderer
        code={`(runtime) => {
          const scene = new runtime.THREE.Scene();
          const camera = new runtime.THREE.PerspectiveCamera(45, 1, 0.1, 100);
          const renderer = new runtime.THREE.WebGLRenderer({ canvas: runtime.canvas });
          renderer.render(scene, camera);
        }`}
        onStatusChange={onStatusChange}
      />,
    );

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith({
        valid: false,
        error: "Three.js scene mounted without visible meshes.",
      });
    });
  });

  it("allows a three preview when a mesh is visible even if the readiness check misses a frame", async () => {
    const onStatusChange = vi.fn();
    render(
      <ThreePieceRenderer
        code={`(runtime) => {
          const scene = new runtime.THREE.Scene();
          const camera = new runtime.THREE.PerspectiveCamera(45, 1, 0.1, 100);
          const mesh = new runtime.THREE.Mesh(
            new runtime.THREE.BoxGeometry(),
            new runtime.THREE.MeshStandardMaterial({ color: "#0f3460" }),
          );
          scene.add(mesh);
        }`}
        onStatusChange={onStatusChange}
      />,
    );

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith({
        valid: true,
        error: null,
        warning: null,
      });
    });
  });
});
