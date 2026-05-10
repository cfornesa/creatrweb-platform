import { useEffect, useRef, useState } from "react";
import { evaluateArtPieceCode } from "./ArtPieceRenderer";

type C2PieceRendererProps = {
  code: string;
  className?: string;
  height?: number;
  onStatusChange?: (status: { valid: boolean; error: string | null; warning?: string | null }) => void;
};

export function C2PieceRenderer({
  code,
  className,
  height = 420,
  onStatusChange,
}: C2PieceRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cleanup: (() => void) | undefined;
    let frameId = 0;
    let cancelled = false;

    setError(null);

    void (async () => {
      try {
        const c2Module = (await import("c2.js")) as any;
        if (cancelled || !mountedRef.current) {
          return;
        }

        const c2 = c2Module.default ?? c2Module;
        const runner = evaluateArtPieceCode(code) as (runtime: {
          c2: unknown;
          canvas: HTMLCanvasElement;
          startFrame: (handler: (frameCount: number) => void) => void;
        }) => void | (() => void);

        if (typeof runner !== "function") {
          throw new Error("The saved sketch did not evaluate to a function.");
        }

        const startFrame = (handler: (frameCount: number) => void) => {
          let frameCount = 0;
          const tick = () => {
            if (cancelled || !mountedRef.current) return;
            frameCount += 1;
            handler(frameCount);
            frameId = window.requestAnimationFrame(tick);
          };
          frameId = window.requestAnimationFrame(tick);
        };

        const returned = runner({ c2, canvas, startFrame });
        cleanup = typeof returned === "function" ? returned : undefined;
        if (mountedRef.current) {
          onStatusChange?.({ valid: true, error: null });
        }
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : "Unknown preview error";
        if (mountedRef.current) {
          setError(message);
          onStatusChange?.({ valid: false, error: message });
        }
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.cancelAnimationFrame(frameId);
      try {
        cleanup?.();
      } catch (err) {
        // Ignore cleanup errors
      }
      const context = canvas.getContext("2d");
      try {
        context?.clearRect(0, 0, canvas.width, canvas.height);
      } catch (err) {
        // Ignore
      }
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
