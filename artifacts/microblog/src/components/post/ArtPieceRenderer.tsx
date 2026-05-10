import type { ArtPieceEngine } from "@workspace/api-client-react";
import { C2PieceRenderer } from "./C2PieceRenderer";
import { P5PieceRenderer } from "./P5PieceRenderer";
import { ThreePieceRenderer } from "./ThreePieceRenderer";

type ArtPieceRendererProps = {
  engine: ArtPieceEngine;
  code: string;
  className?: string;
  height?: number;
  onStatusChange?: (status: { valid: boolean; error: string | null; warning?: string | null }) => void;
};

export function ArtPieceRenderer(props: ArtPieceRendererProps) {
  if (props.engine === "p5") {
    return <P5PieceRenderer {...props} />;
  }
  if (props.engine === "c2") {
    return <C2PieceRenderer {...props} />;
  }
  return <ThreePieceRenderer {...props} />;
}

export function evaluateArtPieceCode(code: string): any {
  const captured: any = {};
  const mockWindow = new Proxy(window, {
    get(target, prop, receiver) {
      if (prop === "sketch") return captured.sketch;
      if (Object.prototype.hasOwnProperty.call(captured, prop)) return captured[prop];

      const val = (target as any)[prop];
      // Many window functions (like addEventListener) require 'window' as 'this'
      if (typeof val === "function") return val.bind(target);
      return val;
    },
    set(target, prop, value) {
      if (prop === "sketch") {
        captured.sketch = value;
        return true;
      }
      captured[prop] = value;
      return true;
    },
    // Prevent common Proxy traps from leaking or causing issues
    has(target, prop) {
      return prop === "sketch" || prop in captured || prop in target;
    },
  });

  let sketchFactory: any = null;
  try {
    // Shadow 'window', 'self', and 'top' to prevent easy escapes
    new Function("window", "self", "top", code)(mockWindow, mockWindow, mockWindow);
    sketchFactory = captured.sketch;
  } catch (err) {
    // Fallback
  }

  if (!sketchFactory || typeof sketchFactory !== "function") {
    try {
      const expression = code.trim().replace(/;+$/, "");
      sketchFactory = new Function(`return (${expression});`)();
    } catch (err) {
      // Both failed
    }
  }

  return sketchFactory;
}
