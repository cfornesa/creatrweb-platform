import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type PreviewMesh = {
  position: { x: number; y: number; z: number };
  geometry: { parameters?: Record<string, unknown> };
};

type PreviewCamera = {
  position: { set: (x: number, y: number, z: number) => void };
  lookAt: (x: number, y: number, z: number) => void;
  updateMatrixWorld: (force?: boolean) => void;
};

type ThreePieceRendererProps = {
  code: string;
  className?: string;
  height?: number;
  onStatusChange?: (status: { valid: boolean; error: string | null; warning?: string | null }) => void;
};

export function ThreePieceRenderer({
  code,
  className,
  height = 420,
  onStatusChange,
}: ThreePieceRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cleanup: (() => void) | undefined;
    let frameId = 0;

    setError(null);

    try {
      const previewState = {
        meshes: [] as PreviewMesh[],
        camera: null as PreviewCamera | null,
        renderCount: 0,
      };
      const runner = new Function(`return (${code});`)() as (runtime: {
        THREE: typeof THREE;
        canvas: HTMLCanvasElement;
        startFrame: (handler: (frameCount: number) => void) => void;
      }) => void | (() => void);

      const startFrame = (handler: (frameCount: number) => void) => {
        let frameCount = 0;
        const tick = () => {
          frameCount += 1;
          handler(frameCount);
          frameId = window.requestAnimationFrame(tick);
        };
        frameId = window.requestAnimationFrame(tick);
      };

      const returned = runner({
        THREE: createInstrumentedThreeRuntime(previewState),
        canvas,
        startFrame,
      });
      cleanup = typeof returned === "function" ? returned : undefined;
      void waitForThreePreviewStatus(previewState).then((status) => {
        if (!status.valid) {
          console.warn("Three.js preview failed", { message: status.error });
          setError(status.error);
          onStatusChange?.({ valid: false, error: status.error });
          return;
        }
        onStatusChange?.({ valid: true, error: null, warning: status.warning ?? null });
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Unknown preview error";
      console.warn("Three.js preview failed", { message });
      setError(message);
      onStatusChange?.({ valid: false, error: message });
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      cleanup?.();
    };
  }, [code, onStatusChange]);

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className="w-full overflow-hidden rounded-xl border border-border bg-black/5"
        style={{ minHeight: height }}
      />
      {error ? (
        <p className="mt-2 text-sm text-destructive">Preview failed: {error}</p>
      ) : null}
    </div>
  );
}

function createInstrumentedThreeRuntime(state: {
  meshes: PreviewMesh[];
  camera: PreviewCamera | null;
  renderCount: number;
}) {
  class InstrumentedScene extends (THREE.Scene as new () => any) {
    add(...objects: any[]) {
      for (const object of objects) {
        if (object instanceof (THREE.Mesh as unknown as new (...args: any[]) => any)) {
          state.meshes.push(object);
        }
      }
      return super.add(...objects);
    }
  }

  class InstrumentedPerspectiveCamera extends (THREE.PerspectiveCamera as new (...args: any[]) => any) {
    constructor(...args: any[]) {
      super(...args);
      state.camera = this as unknown as PreviewCamera;
    }
  }

  class InstrumentedWebGLRenderer extends (THREE.WebGLRenderer as new (...args: any[]) => any) {
    render(scene: any, camera: any) {
      state.renderCount += 1;
      return super.render(scene, camera);
    }
  }

  return {
    ...THREE,
    Scene: InstrumentedScene,
    PerspectiveCamera: InstrumentedPerspectiveCamera,
    WebGLRenderer: InstrumentedWebGLRenderer,
  } as typeof THREE;
}

function fitAndValidateThreePreview(state: {
  meshes: PreviewMesh[];
  camera: PreviewCamera | null;
  renderCount: number;
}) {
  if (state.meshes.length === 0) {
    return "Three.js scene mounted without visible meshes.";
  }
  if (!state.camera) {
    return "Three.js scene did not initialize a camera.";
  }

  let maxExtent = 2;
  for (const mesh of state.meshes) {
    const position = mesh.position;
    const geometry = mesh.geometry as { parameters?: Record<string, unknown> };
    const parameters = geometry.parameters ?? {};
    const radius = getThreeMeshRadius(parameters);
    maxExtent = Math.max(
      maxExtent,
      Math.abs(position.x) + radius,
      Math.abs(position.y) + radius,
      Math.abs(position.z) + radius,
    );
  }

  const safeDistance = Math.max(4.5, maxExtent * 2.4);
  state.camera.position.set(safeDistance, Math.max(1.8, maxExtent * 0.9), safeDistance);
  state.camera.lookAt(0, 0, 0);
  state.camera.updateMatrixWorld(true);
  return null;
}

async function waitForThreePreviewStatus(state: {
  meshes: PreviewMesh[];
  camera: PreviewCamera | null;
  renderCount: number;
}): Promise<
  | { valid: true; warning?: string | null }
  | { valid: false; error: string }
> {
  const attempts = 4;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    if (state.meshes.length > 0 && state.camera && state.renderCount > 0) {
      fitAndValidateThreePreview(state);
      return { valid: true, warning: null };
    }
  }

  if (state.meshes.length === 0) {
    return { valid: false, error: "Three.js scene mounted without visible meshes." };
  }
  if (!state.camera) {
    return { valid: false, error: "Three.js scene did not initialize a camera." };
  }

  const warning = fitAndValidateThreePreview(state);
  return { valid: true, warning };
}

function getThreeMeshRadius(parameters: Record<string, unknown>) {
  const width = typeof parameters.width === "number" ? parameters.width : null;
  const height = typeof parameters.height === "number" ? parameters.height : null;
  const depth = typeof parameters.depth === "number" ? parameters.depth : null;
  const radius = typeof parameters.radius === "number" ? parameters.radius : null;
  const tube = typeof parameters.tube === "number" ? parameters.tube : null;
  if (width !== null || height !== null || depth !== null) {
    return Math.max(width ?? 1, height ?? 1, depth ?? 1) * 0.75;
  }
  if (radius !== null && tube !== null) {
    return radius + tube;
  }
  if (radius !== null) {
    return radius;
  }
  return 1;
}
