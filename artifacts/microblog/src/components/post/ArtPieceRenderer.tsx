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
