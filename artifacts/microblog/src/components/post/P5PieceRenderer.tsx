import { useEffect, useRef, useState } from "react";
import p5 from "p5";
import { evaluateArtPieceCode } from "./ArtPieceRenderer";

type P5PieceRendererProps = {
  code: string;
  className?: string;
  height?: number;
  onStatusChange?: (status: { valid: boolean; error: string | null; warning?: string | null }) => void;
};

export function P5PieceRenderer({
  code,
  className,
  height = 420,
  onStatusChange,
}: P5PieceRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<p5 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    setError(null);
    container.innerHTML = "";
    try {
      instanceRef.current?.remove();
    } catch (err) {
      console.warn("p5 instance remove failed", err);
    }
    instanceRef.current = null;

    try {
      const sketchFactory = evaluateArtPieceCode(code);
      if (typeof sketchFactory !== "function") {
        throw new Error("The saved sketch did not evaluate to a function.");
      }
      instanceRef.current = new p5((p) => sketchFactory(p), container);
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

    return () => {
      mountedRef.current = false;
      try {
        instanceRef.current?.remove();
      } catch (err) {
        // Ignore cleanup errors
      }
      instanceRef.current = null;
      if (container) container.innerHTML = "";
    };
  }, [code, onStatusChange]);

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-border bg-black/5"
        style={{ minHeight: height }}
      />
      {error ? (
        <p className="mt-2 text-sm text-destructive">
          Preview failed: {error}
        </p>
      ) : null}
    </div>
  );
}
