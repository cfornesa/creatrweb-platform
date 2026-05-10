import { useEffect, useRef, useState } from "react";

type C2PieceRendererProps = {
  code: string;
  className?: string;
  height?: number;
  onStatusChange?: (status: { valid: boolean; error: string | null }) => void;
};

export function C2PieceRenderer({
  code,
  className,
  height = 420,
  onStatusChange,
}: C2PieceRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        if (cancelled) {
          return;
        }

        const c2 = c2Module.default ?? c2Module;
        const runner = new Function(`return (${code});`)() as (runtime: {
          c2: unknown;
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

        const returned = runner({ c2, canvas, startFrame });
        cleanup = typeof returned === "function" ? returned : undefined;
        onStatusChange?.({ valid: true, error: null });
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : "Unknown preview error";
        setError(message);
        onStatusChange?.({ valid: false, error: message });
      }
    })();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      cleanup?.();
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
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
