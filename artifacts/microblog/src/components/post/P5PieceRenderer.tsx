import { useEffect, useRef, useState } from "react";
import p5 from "p5";

type P5PieceRendererProps = {
  code: string;
  className?: string;
  height?: number;
  onStatusChange?: (status: { valid: boolean; error: string | null }) => void;
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    setError(null);
    container.innerHTML = "";
    instanceRef.current?.remove();
    instanceRef.current = null;

    try {
      const sketchFactory = new Function(`return (${code});`)() as (p: p5) => void;
      if (typeof sketchFactory !== "function") {
        throw new Error("The saved sketch did not evaluate to a function.");
      }
      instanceRef.current = new p5((p) => sketchFactory(p), container);
      onStatusChange?.({ valid: true, error: null });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Unknown preview error";
      setError(message);
      onStatusChange?.({ valid: false, error: message });
    }

    return () => {
      instanceRef.current?.remove();
      instanceRef.current = null;
      container.innerHTML = "";
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
