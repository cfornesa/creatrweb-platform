import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ArrowLeft, Box, Maximize2, Minimize2 } from "lucide-react";
import {
  type EmbeddedArtPiece,
  getGetEmbeddedArtPieceQueryKey,
  useGetEmbeddedArtPiece,
} from "@workspace/api-client-react";
import { useLocation, useRoute } from "wouter";
import { ArtPieceRenderer } from "@/components/post/ArtPieceRenderer";
import {
  computeThreeAutoFitView,
  createPresentationSurface,
  createMountedGalleryShell,
  disposeObjectMaterial,
  drawContainedIntoPresentationSurface,
  fitMountedGalleryCamera,
  isCompactImmersiveViewport,
  NORMALIZED_PRESENTATION_GALLERY_PROFILE,
  updateMountedGalleryLayout,
} from "@/lib/immersive-gallery";
import {
  createImmersiveHost,
  DEFAULT_IMMERSIVE_RUNTIME_SIZE,
  getCanvasMetrics,
  resolveSketchFactory,
  type ImmersiveRuntimeSize,
} from "@/lib/immersive-piece-runtime";

function useReturnToPrevious() {
  const [, setLocation] = useLocation();
  return () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation("/");
  };
}

type PieceStageProps = {
  engine: "p5" | "c2" | "three";
  code: string;
  htmlCode?: string | null;
  cssCode?: string | null;
  title: string;
  onError: (message: string | null) => void;
};

function ImmersiveGalleryPieceStage({
  code,
  htmlCode,
  cssCode,
  title,
  engine,
  onError,
}: PieceStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const stageEl = stage;
    const runtimeSize = { ...DEFAULT_IMMERSIVE_RUNTIME_SIZE };
    const presentationSurface =
      engine === "p5" ? createPresentationSurface(1200, 900, 72) : null;
    const shell = createMountedGalleryShell(
      stageEl,
      presentationSurface
        ? presentationSurface.width / presentationSurface.height
        : runtimeSize.width / runtimeSize.height,
      presentationSurface ? NORMALIZED_PRESENTATION_GALLERY_PROFILE : undefined,
    );
    const host = createImmersiveHost(
      htmlCode,
      cssCode,
      engine === "p5" ? '<div id="canvas-container"></div>' : '<canvas id="piece-canvas"></canvas>',
      runtimeSize,
    );

    let sourceCanvas: HTMLCanvasElement | null = null;
    let artTexture: any = null;
    let frameId = 0;
    let detectCanvasTimer: number | null = null;
    let detectCanvasAttempts = 0;
    let stopSourceLoop: (() => void) | null = null;
    let p5Instance: { remove?: () => void } | null = null;
    let disposed = false;

    function syncCanvas(nextCanvas: HTMLCanvasElement) {
      sourceCanvas = nextCanvas;
      const displayCanvas = presentationSurface?.canvas ?? nextCanvas;
      if (!artTexture) {
        artTexture = new THREE.CanvasTexture(displayCanvas);
        artTexture.colorSpace = THREE.SRGBColorSpace;
        shell.artMaterial.map = artTexture;
        shell.artMaterial.needsUpdate = true;
      }
      if (presentationSurface) {
        drawContainedIntoPresentationSurface(
          presentationSurface,
          nextCanvas.width || runtimeSize.width,
          nextCanvas.height || runtimeSize.height,
          (ctx, x, y, width, height) => {
            ctx.drawImage(nextCanvas, x, y, width, height);
          },
          "#05070f",
        );
      }
      const metrics = getCanvasMetrics(displayCanvas, runtimeSize);
      updateMountedGalleryLayout(shell, metrics.aspect);
      fitMountedGalleryCamera(shell, stageEl);
      onError(null);
    }

    function pollForCanvas(root: ParentNode, onMissing: string) {
      const candidate = root.querySelector("canvas");
      if (candidate instanceof HTMLCanvasElement) {
        if (candidate.width === 0 || candidate.height === 0) {
          candidate.width = runtimeSize.width;
          candidate.height = runtimeSize.height;
        }
        syncCanvas(candidate);
        return;
      }
      if (detectCanvasAttempts >= 80) {
        onError(onMissing);
        return;
      }
      detectCanvasAttempts += 1;
      detectCanvasTimer = window.setTimeout(() => pollForCanvas(root, onMissing), 100);
    }

    async function bootRuntime() {
      try {
        if (engine === "p5") {
          const p5Module = await import("p5");
          const P5 = (p5Module.default ?? p5Module) as any;
          const sketchFactory = resolveSketchFactory(code);
          const mount =
            host.querySelector("#canvas-container") ||
            host.querySelector("#sketch-container") ||
            host;
          p5Instance = new P5(sketchFactory, mount);
          pollForCanvas(mount, "This p5 piece did not produce a canvas for immersive mode.");
          return;
        }

        const c2Module = await import("c2.js");
        const c2 = (c2Module.default ?? c2Module) as any;
        const sketchFactory = resolveSketchFactory(code);
        const managedCanvas =
          (host.querySelector("canvas") as HTMLCanvasElement | null) ||
          document.createElement("canvas");
        managedCanvas.width = runtimeSize.width;
        managedCanvas.height = runtimeSize.height;
        managedCanvas.style.width = `${runtimeSize.width}px`;
        managedCanvas.style.height = `${runtimeSize.height}px`;
        if (!managedCanvas.parentNode) {
          host.appendChild(managedCanvas);
        }
        syncCanvas(managedCanvas);

        let rafId = 0;
        const startFrame = (handler: (frameCount: number) => void) => {
          let frameCount = 0;
          function tick() {
            frameCount += 1;
            handler(frameCount);
            rafId = window.requestAnimationFrame(tick);
          }
          rafId = window.requestAnimationFrame(tick);
          return () => window.cancelAnimationFrame(rafId);
        };

        const cleanup = sketchFactory({
          c2,
          canvas: managedCanvas,
          startFrame,
          size: runtimeSize,
          width: runtimeSize.width,
          height: runtimeSize.height,
        });
        stopSourceLoop =
          typeof cleanup === "function"
            ? cleanup
            : () => window.cancelAnimationFrame(rafId);
      } catch {
        onError(`This ${engine} piece could not boot for immersive mode.`);
      }
    }

    function animate() {
      frameId = requestAnimationFrame(animate);
      const activeSourceCanvas = sourceCanvas;
      if (activeSourceCanvas && artTexture) {
        if (presentationSurface) {
          drawContainedIntoPresentationSurface(
            presentationSurface,
            activeSourceCanvas.width || runtimeSize.width,
            activeSourceCanvas.height || runtimeSize.height,
            (ctx, x, y, width, height) => {
              ctx.drawImage(activeSourceCanvas, x, y, width, height);
            },
            "#05070f",
          );
        }
        artTexture.needsUpdate = true;
      }
      shell.controls.update();
      shell.renderer.render(shell.scene, shell.camera);
    }

    bootRuntime();
    fitMountedGalleryCamera(shell, stageEl);
    animate();
    function handleResize() {
      fitMountedGalleryCamera(shell, stageEl);
    }
    window.addEventListener("resize", handleResize);
    const observer = new ResizeObserver(handleResize);
    observer.observe(stageEl);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      if (detectCanvasTimer) {
        window.clearTimeout(detectCanvasTimer);
      }
      cancelAnimationFrame(frameId);
      artTexture?.dispose?.();
      shell.controls.dispose();
      shell.floor.geometry.dispose();
      disposeObjectMaterial(shell.floor.material);
      shell.backWall.geometry.dispose();
      disposeObjectMaterial(shell.backWall.material);
      shell.framePanel.geometry.dispose();
      disposeObjectMaterial(shell.framePanel.material);
      shell.artMesh.geometry.dispose();
      shell.artMaterial.dispose();
      shell.frameMesh.geometry.dispose();
      disposeObjectMaterial(shell.frameMesh.material);
      shell.renderer.dispose();
      stopSourceLoop?.();
      p5Instance?.remove?.();
      host.remove();
      stageEl.innerHTML = "";
    };
  }, [code, cssCode, engine, htmlCode, onError]);

  return <div ref={stageRef} className="h-full w-full overflow-hidden" />;
}

function ImmersiveThreePieceStage({
  code,
  htmlCode,
  cssCode,
  title,
  onError,
}: Omit<PieceStageProps, "engine">) {
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const stageEl = stage;

    const runtimeSize: ImmersiveRuntimeSize = { ...DEFAULT_IMMERSIVE_RUNTIME_SIZE };
    const host = createImmersiveHost(
      htmlCode,
      cssCode,
      '<div id="container"></div>',
      runtimeSize,
    );
    const canvas =
      (host.querySelector("canvas") as HTMLCanvasElement | null) ||
      document.createElement("canvas");
    canvas.width = runtimeSize.width;
    canvas.height = runtimeSize.height;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";

    const mount =
      host.querySelector("#container") ||
      host.querySelector("#canvas-container") ||
      host.querySelector("#sketch-container") ||
      host;
    if (!canvas.parentNode) {
      mount.appendChild(canvas);
    }

    stageEl.innerHTML = "";
    stageEl.appendChild(canvas);

    let cleanup: (() => void) | void;
    let frameId = 0;
    let stopFrameHandles = new Set<() => void>();
    const state: {
      scene: any;
      camera: any;
      renderer: any;
      objects: any[];
    } = {
      scene: null,
      camera: null,
      renderer: null,
      objects: [],
    };

    const instrumentedThree: any = { ...THREE };
    const OriginalScene = THREE.Scene;
    instrumentedThree.Scene = class extends OriginalScene {
      constructor(...args: any[]) {
        super(...args);
        state.scene = this;
      }
      add(...objects: any[]) {
        objects.forEach((object) => {
          if (object?.geometry) {
            state.objects.push(object);
          }
        });
        return super.add(...objects);
      }
    };

    const OriginalPerspectiveCamera = THREE.PerspectiveCamera;
    instrumentedThree.PerspectiveCamera = class extends OriginalPerspectiveCamera {
      constructor(...args: any[]) {
        super(...args);
        state.camera = this;
      }
    };

    if ("OrthographicCamera" in THREE) {
      const OriginalOrthographicCamera = (THREE as any).OrthographicCamera;
      instrumentedThree.OrthographicCamera = class extends OriginalOrthographicCamera {
        constructor(...args: any[]) {
          super(...args);
          state.camera = this;
        }
      };
    }

    const OriginalRenderer = THREE.WebGLRenderer;
    instrumentedThree.WebGLRenderer = class extends OriginalRenderer {
      constructor(input: any) {
        super({
          ...input,
          canvas,
        });
        state.renderer = this;
        this.setPixelRatio?.(Math.min(window.devicePixelRatio, 2));
      }
    };

    const startFrame = (handler: (frameCount: number) => void) => {
      let frameCount = 0;
      let rafId = 0;
      function tick() {
        frameCount += 1;
        handler(frameCount);
        rafId = window.requestAnimationFrame(tick);
      }
      rafId = window.requestAnimationFrame(tick);
      const stop = () => window.cancelAnimationFrame(rafId);
      stopFrameHandles.add(stop);
      return () => {
        stop();
        stopFrameHandles.delete(stop);
      };
    };

    let controls: OrbitControls | null = null;

    function resize() {
      const width = stageEl.clientWidth || window.innerWidth;
      const height = stageEl.clientHeight || window.innerHeight;
      if (state.renderer?.setSize) {
        state.renderer.setSize(width, height, false);
      }
      if (state.camera) {
        if ("aspect" in state.camera) {
          state.camera.aspect = width / Math.max(height, 1);
        }
        state.camera.updateProjectionMatrix?.();
      }
      if (controls) {
        autoFitCamera(width);
      }
    }

    function autoFitCamera(viewportWidth = stageEl.clientWidth || window.innerWidth) {
      if (!state.scene || !state.camera || state.objects.length === 0) {
        return;
      }
      state.objects.forEach((object) => {
        object.geometry?.computeBoundingBox?.();
      });
      const box = new THREE.Box3().setFromObject(state.scene);
      if (box.isEmpty()) {
        return;
      }
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const nextView = computeThreeAutoFitView(
        center,
        maxDim,
        state.camera.aspect || 1,
        state.camera.fov || 45,
        isCompactImmersiveViewport(viewportWidth),
      );
      state.camera.position.set(nextView.x, nextView.y, nextView.z);
      state.camera.lookAt(center);
      state.camera.updateProjectionMatrix?.();
      state.camera.updateMatrixWorld?.(true);
      controls?.target.copy?.(center);
      controls?.update();
    }

    function animateControls() {
      frameId = requestAnimationFrame(animateControls);
      controls?.update();
    }

    try {
      const sketchFactory = resolveSketchFactory(code);
      cleanup = sketchFactory({
        THREE: instrumentedThree,
        canvas,
        startFrame,
        size: runtimeSize,
        width: runtimeSize.width,
        height: runtimeSize.height,
      });

      if (!state.renderer || !state.camera) {
        throw new Error("This Three.js piece did not initialize a renderer and camera for immersive mode.");
      }

      resize();
      controls = new OrbitControls(state.camera, canvas);
      controls.enableDamping = true;
      controls.enablePan = true;
      controls.minDistance = 0.6;
      controls.maxDistance = 40;
      autoFitCamera();
      animateControls();
      onError(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Immersive runtime failed to boot.");
    }

    const observer = new ResizeObserver(resize);
    observer.observe(stageEl);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
      controls?.dispose();
      stopFrameHandles.forEach((stop) => stop());
      stopFrameHandles.clear();
      cleanup?.();
      state.renderer?.dispose?.();
      host.remove();
      stageEl.innerHTML = "";
    };
  }, [code, cssCode, htmlCode, onError, title]);

  return <div ref={stageRef} className="h-full w-full overflow-hidden" />;
}

function ImmersivePieceRouteBody({
  title,
  versionId,
  data,
  runtimeError,
  setRuntimeError,
  isFullscreen,
  setIsFullscreen,
}: {
  title: string;
  versionId?: number;
  data: EmbeddedArtPiece;
  runtimeError: string | null;
  setRuntimeError: (message: string | null) => void;
  isFullscreen: boolean;
  setIsFullscreen: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const isThree = data.version.engine === "three";

  return (
    <div className="grid gap-0 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div
        className={
          isFullscreen
            ? "fixed inset-0 z-50 bg-[#050b16]"
            : "relative overflow-hidden"
        }
      >
        {runtimeError ? (
          <div className="p-6">
            <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="font-medium">Immersive mode unavailable for this piece.</p>
              <p className="mt-1 text-amber-100/80">{runtimeError}</p>
            </div>
            <ArtPieceRenderer
              engine={data.version.engine}
              code={data.version.generatedCode}
              htmlCode={data.version.htmlCode}
              cssCode={data.version.cssCode}
              title={title}
              height={520}
            />
          </div>
        ) : isThree ? (
          <div
            className={
              isFullscreen
                ? "h-[100svh] w-screen overflow-hidden"
                : "h-[40svh] min-h-[16rem] w-full overflow-hidden lg:h-full lg:min-h-0"
            }
          >
            <ImmersiveThreePieceStage
              code={data.version.generatedCode}
              htmlCode={data.version.htmlCode}
              cssCode={data.version.cssCode}
              title={title}
              onError={setRuntimeError}
            />
          </div>
        ) : (
          <div
            className={
              isFullscreen
                ? "h-[100svh] w-screen overflow-hidden"
                : "h-[40svh] min-h-[16rem] w-full overflow-hidden lg:h-full lg:min-h-0"
            }
          >
            <ImmersiveGalleryPieceStage
              engine={data.version.engine}
              code={data.version.generatedCode}
              htmlCode={data.version.htmlCode}
              cssCode={data.version.cssCode}
              title={title}
              onError={setRuntimeError}
            />
          </div>
        )}
        {!runtimeError ? (
          <button
            type="button"
            onClick={() => setIsFullscreen((current) => !current)}
            aria-label={isFullscreen ? "Return to gallery view" : "Expand immersive view"}
            className="absolute bottom-4 right-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        ) : null}
      </div>

      <aside className="border-t border-white/10 bg-white/[0.03] p-5 lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <Box className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            {isThree
              ? "This Three.js piece now runs directly in a live immersive 3D canvas with viewer-managed camera controls."
              : `This ${data.version.engine.toUpperCase()} piece uses the browser-based non-Three immersive gallery scene with a normalized presentation surface and centered default framing.`}
          </p>
          <dl className="mt-5 space-y-3 text-sm text-white/75">
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-white/45">Engine</dt>
              <dd className="mt-1 uppercase tracking-[0.12em]">{data.version.engine}</dd>
            </div>
            {versionId ? (
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-white/45">Version</dt>
                <dd className="mt-1">Version {versionId}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-white/45">Interaction</dt>
              <dd className="mt-1">Drag to orbit, scroll to zoom, right-drag or modifier-drag to pan.</dd>
            </div>
            {runtimeError ? (
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-amber-300/80">Fallback</dt>
                <dd className="mt-1 text-amber-100/80">{runtimeError}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </aside>
    </div>
  );
}

export default function ImmersivePiecePage() {
  const [, params] = useRoute("/immersive/pieces/:id");
  const goBack = useReturnToPrevious();
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pieceId = Number(params?.id);
  const versionRaw = new URLSearchParams(window.location.search).get("version");
  const versionId = versionRaw ? Number(versionRaw) : undefined;

  const { data, isLoading, error } = useGetEmbeddedArtPiece(
    pieceId,
    versionId ? { version: versionId } : undefined,
    {
      query: {
        queryKey: getGetEmbeddedArtPieceQueryKey(
          pieceId,
          versionId ? { version: versionId } : undefined,
        ),
        enabled: Number.isFinite(pieceId) && pieceId > 0,
      },
    },
  );

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
          return;
        }
        goBack();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goBack, isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isFullscreen]);

  const title = useMemo(() => data?.title || "Immersive piece", [data?.title]);

  if (!Number.isFinite(pieceId) || pieceId <= 0 || error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050b16] px-6 text-white">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Piece not found</h1>
          <p className="mt-3 text-sm text-white/70">
            The immersive route could not load this piece.
          </p>
          <button
            type="button"
            onClick={goBack}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050b16] text-white lg:h-screen lg:overflow-hidden">
      <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-xs uppercase tracking-[0.22em] text-white/55">Immersive View</p>
            <p className="text-sm font-medium leading-tight text-white/80 sm:text-base">{title}</p>
          </div>
        </header>

        {isLoading || !data?.version ? (
          <div className="flex flex-1 items-center justify-center text-sm text-white/60">
            Loading immersive scene…
          </div>
        ) : (
          <ImmersivePieceRouteBody
            title={title}
            versionId={versionId}
            data={data}
            runtimeError={runtimeError}
            setRuntimeError={setRuntimeError}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
          />
        )}
      </div>
    </div>
  );
}
