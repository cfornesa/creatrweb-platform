import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ArrowLeft, Box } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import {
  createPresentationSurface,
  createMountedGalleryShell,
  disposeObjectMaterial,
  drawContainedIntoPresentationSurface,
  fitMountedGalleryCamera,
  NORMALIZED_PRESENTATION_GALLERY_PROFILE,
  updateMountedGalleryLayout,
} from "@/lib/immersive-gallery";
import {
  readImmersiveImageMetadata,
  resolveImmersiveImageSrc,
} from "@/lib/immersive-view";

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

export default function ImmersiveImagePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [, params] = useRoute("/immersive/images/:encodedRef");
  const goBack = useReturnToPrevious();
  const [error, setError] = useState<string | null>(null);
  const encodedRef = params?.encodedRef ?? "";
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const metadata = useMemo(() => readImmersiveImageMetadata(searchParams), [searchParams]);
  const imageSrc = useMemo(
    () => (encodedRef ? resolveImmersiveImageSrc(encodedRef) : ""),
    [encodedRef],
  );

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        goBack();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goBack]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !imageSrc) {
      if (!imageSrc) {
        setError("The image route is missing a valid source.");
      }
      return;
    }
    const stageEl = container;
    const presentation = createPresentationSurface(1200, 900, 72);
    const shell = createMountedGalleryShell(
      stageEl,
      presentation.width / presentation.height,
      NORMALIZED_PRESENTATION_GALLERY_PROFILE,
    );

    let textureRef: any = null;
    let frameId = 0;
    let disposed = false;

    const loader = new THREE.TextureLoader();
    loader.load(
      imageSrc,
      (texture: any) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        const image = texture.image as { width?: number; height?: number } | undefined;
        const width = image?.width ?? 1600;
        const height = image?.height ?? 900;
        drawContainedIntoPresentationSurface(
          presentation,
          width,
          height,
          (ctx, x, y, drawWidth, drawHeight) => {
            ctx.drawImage(texture.image, x, y, drawWidth, drawHeight);
          },
          "#f8f5ee",
        );
        texture.dispose();
        textureRef = new THREE.CanvasTexture(presentation.canvas);
        textureRef.colorSpace = THREE.SRGBColorSpace;
        updateMountedGalleryLayout(shell, presentation.width / presentation.height);
        shell.artMaterial.map = textureRef;
        shell.artMaterial.needsUpdate = true;
        fitMountedGalleryCamera(shell, stageEl);
        setError(null);
      },
      undefined,
      () => {
        setError("The image could not be loaded into immersive view.");
      },
    );

    function animate() {
      frameId = requestAnimationFrame(animate);
      if (textureRef) {
        textureRef.needsUpdate = true;
      }
      shell.controls.update();
      shell.renderer.render(shell.scene, shell.camera);
    }
    animate();

    function handleResize() {
      fitMountedGalleryCamera(shell, stageEl);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameId);
      textureRef?.dispose?.();
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
      stageEl.innerHTML = "";
    };
  }, [imageSrc]);

  return (
    <div className="h-screen overflow-hidden bg-[#050b16] text-white">
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.22em] text-white/55">Immersive View</p>
            <p className="text-sm font-medium text-white/80">{metadata.title || metadata.alt || "Image"}</p>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="relative min-h-0 overflow-hidden">
            {error ? (
              <div className="flex h-full items-center justify-center p-6">
                <img
                  src={imageSrc}
                  alt={metadata.alt || metadata.title || "Immersive image fallback"}
                  className="max-h-[75vh] w-auto max-w-full rounded-2xl border border-white/10 object-contain shadow-2xl"
                />
              </div>
            ) : (
              <div ref={containerRef} className="h-full min-h-0 w-full overflow-hidden" />
            )}
          </div>

          <aside className="overflow-y-auto border-t border-white/10 bg-white/[0.03] p-5 lg:border-l lg:border-t-0">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <Box className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-semibold">{metadata.title || metadata.alt || "Immersive image"}</h1>
              {metadata.caption ? (
                <p className="mt-3 text-sm leading-relaxed text-white/70">{metadata.caption}</p>
              ) : null}
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                This image uses the browser-based non-Three immersive gallery scene with a normalized presentation surface and centered default framing.
              </p>
              <dl className="mt-5 space-y-3 text-sm text-white/75">
                <div>
                  <dt className="text-xs uppercase tracking-[0.18em] text-white/45">Alt text</dt>
                  <dd className="mt-1 leading-relaxed">{metadata.alt || "No alt text provided in this view."}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.18em] text-white/45">Source</dt>
                  <dd className="mt-1 break-all text-white/60">{imageSrc}</dd>
                </div>
                {error ? (
                  <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-amber-300/80">Fallback</dt>
                    <dd className="mt-1 text-amber-100/80">{error}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
