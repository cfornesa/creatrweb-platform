import { useRoute } from "wouter";
import {
  getGetEmbeddedArtPieceQueryKey,
  useGetEmbeddedArtPiece,
} from "@workspace/api-client-react";
import { ArtPieceRenderer } from "@/components/post/ArtPieceRenderer";

export default function PieceEmbed() {
  const [, params] = useRoute("/embed/pieces/:id");
  const pieceId = Number(params?.id);
  const searchParams = new URLSearchParams(window.location.search);
  const version = searchParams.get("version");
  const versionId = version ? Number(version) : undefined;

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

  if (isLoading) {
    return <div className="min-h-screen animate-pulse bg-card" />;
  }

  if (!data || error || !Number.isFinite(pieceId) || pieceId <= 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-card p-8 text-center">
        <div>
          <h1 className="text-lg font-semibold">Piece not found</h1>
          <p className="text-sm text-muted-foreground">
            The interactive piece you requested is unavailable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen border border-border bg-card p-4">
      <ArtPieceRenderer
        engine={data.version.engine}
        code={data.version.generatedCode}
        height={460}
      />
    </div>
  );
}
