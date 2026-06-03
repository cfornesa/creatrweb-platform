import { useState } from "react";
import {
  useGetRecycleBin,
  useRestoreTrashedPost,
  useRestoreTrashedPiece,
  useRestoreTrashedMedia,
  usePermanentDeleteTrashedPost,
  usePermanentDeleteTrashedPiece,
  usePermanentDeleteTrashedMedia,
  useBulkPermanentDelete,
  getGetRecycleBinQueryKey,
  getListArtPiecesQueryKey,
  type TrashedPost,
  type TrashedPiece,
  type TrashedMedia,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function toUtcDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function relativeTime(s: string | null | undefined): string {
  const d = toUtcDate(s);
  if (!d) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

export default function AdminRecycleBinPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const recycleBin = useGetRecycleBin();
  const posts = recycleBin.data?.posts ?? [];
  const pieces = recycleBin.data?.pieces ?? [];
  const media = recycleBin.data?.media ?? [];

  const [activeTab, setActiveTab] = useState<"posts" | "pieces" | "images">("posts");
  const [selectedPostIds, setSelectedPostIds] = useState<Set<number>>(new Set());
  const [selectedPieceIds, setSelectedPieceIds] = useState<Set<number>>(new Set());
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<number>>(new Set());

  const [confirmPermanent, setConfirmPermanent] = useState<{
    type: "single-post" | "single-piece" | "single-media" | "bulk";
    id?: number;
    label?: string;
    count?: number;
  } | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetRecycleBinQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListArtPiecesQueryKey() });
  }

  const restorePost = useRestoreTrashedPost({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Post restored" }); }, onError: () => toast({ title: "Failed to restore post", variant: "destructive" }) } });
  const restorePiece = useRestoreTrashedPiece({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Piece restored" }); }, onError: () => toast({ title: "Failed to restore piece", variant: "destructive" }) } });
  const restoreMedia = useRestoreTrashedMedia({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Image restored" }); }, onError: () => toast({ title: "Failed to restore image", variant: "destructive" }) } });

  const permanentDeletePost = usePermanentDeleteTrashedPost({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Post permanently deleted" }); }, onError: () => toast({ title: "Failed to delete", variant: "destructive" }) } });
  const permanentDeletePiece = usePermanentDeleteTrashedPiece({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Piece permanently deleted" }); }, onError: () => toast({ title: "Failed to delete", variant: "destructive" }) } });
  const permanentDeleteMedia = usePermanentDeleteTrashedMedia({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Image permanently deleted" }); }, onError: () => toast({ title: "Failed to delete", variant: "destructive" }) } });
  const bulkDelete = useBulkPermanentDelete({ mutation: { onSuccess: () => { invalidate(); setSelectedPostIds(new Set()); setSelectedPieceIds(new Set()); setSelectedMediaIds(new Set()); toast({ title: "Items permanently deleted" }); }, onError: () => toast({ title: "Failed to delete items", variant: "destructive" }) } });

  function handleConfirm() {
    if (!confirmPermanent) return;
    if (confirmPermanent.type === "single-post" && confirmPermanent.id != null) {
      permanentDeletePost.mutate({ id: confirmPermanent.id });
    } else if (confirmPermanent.type === "single-piece" && confirmPermanent.id != null) {
      permanentDeletePiece.mutate({ id: confirmPermanent.id });
    } else if (confirmPermanent.type === "single-media" && confirmPermanent.id != null) {
      permanentDeleteMedia.mutate({ id: confirmPermanent.id });
    } else if (confirmPermanent.type === "bulk") {
      bulkDelete.mutate({
        data: {
          postIds: selectedPostIds.size > 0 ? [...selectedPostIds] : undefined,
          pieceIds: selectedPieceIds.size > 0 ? [...selectedPieceIds] : undefined,
          mediaIds: selectedMediaIds.size > 0 ? [...selectedMediaIds] : undefined,
        },
      });
    }
    setConfirmPermanent(null);
  }

  const totalSelected = selectedPostIds.size + selectedPieceIds.size + selectedMediaIds.size;

  return (
    <AdminLayout title="Recycle Bin" description="Review, restore, or permanently delete trashed content.">
      <div className="flex gap-1 mb-4 rounded-lg border border-border bg-muted/40 p-1 w-fit">
        {(["posts", "pieces", "images"] as const).map((tab) => {
          const label = tab === "posts" ? `Posts${posts.length > 0 ? ` (${posts.length})` : ""}` : tab === "pieces" ? `Art Pieces${pieces.length > 0 ? ` (${pieces.length})` : ""}` : `Images${media.length > 0 ? ` (${media.length})` : ""}`;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

        {totalSelected > 0 ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
            <span className="text-sm font-medium">{totalSelected} selected</span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const postIds = [...selectedPostIds];
                  const pieceIds = [...selectedPieceIds];
                  const mediaIds = [...selectedMediaIds];
                  Promise.all([
                    ...postIds.map((id) => restorePost.mutateAsync({ id })),
                    ...pieceIds.map((id) => restorePiece.mutateAsync({ id })),
                    ...mediaIds.map((id) => restoreMedia.mutateAsync({ id })),
                  ]).then(() => {
                    setSelectedPostIds(new Set());
                    setSelectedPieceIds(new Set());
                    setSelectedMediaIds(new Set());
                    toast({ title: "Items restored" });
                    invalidate();
                  }).catch(() => toast({ title: "Some items failed to restore", variant: "destructive" }));
                }}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Restore Selected
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmPermanent({ type: "bulk", count: totalSelected })}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Permanently Delete Selected
              </Button>
            </div>
          </div>
        ) : null}

        {activeTab === "posts" ? (
          posts.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No deleted posts.</p>
          ) : (
            <div className="space-y-2">
              {posts.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  checked={selectedPostIds.has(post.id)}
                  onCheck={(checked) => {
                    setSelectedPostIds((prev) => {
                      const next = new Set(prev);
                      checked ? next.add(post.id) : next.delete(post.id);
                      return next;
                    });
                  }}
                  onRestore={() => restorePost.mutate({ id: post.id })}
                  onPermanentDelete={() => setConfirmPermanent({ type: "single-post", id: post.id, label: post.title || `Post #${post.id}` })}
                />
              ))}
            </div>
          )
        ) : activeTab === "pieces" ? (
          pieces.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No deleted art pieces.</p>
          ) : (
            <div className="space-y-2">
              {pieces.map((piece) => (
                <PieceRow
                  key={piece.id}
                  piece={piece}
                  checked={selectedPieceIds.has(piece.id)}
                  onCheck={(checked) => {
                    setSelectedPieceIds((prev) => {
                      const next = new Set(prev);
                      checked ? next.add(piece.id) : next.delete(piece.id);
                      return next;
                    });
                  }}
                  onRestore={() => restorePiece.mutate({ id: piece.id })}
                  onPermanentDelete={() => setConfirmPermanent({ type: "single-piece", id: piece.id, label: piece.title })}
                />
              ))}
            </div>
          )
        ) : (
          media.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No deleted images.</p>
          ) : (
            <div className="space-y-2">
              {media.map((asset) => (
                <MediaRow
                  key={asset.id}
                  asset={asset}
                  checked={selectedMediaIds.has(asset.id)}
                  onCheck={(checked) => {
                    setSelectedMediaIds((prev) => {
                      const next = new Set(prev);
                      checked ? next.add(asset.id) : next.delete(asset.id);
                      return next;
                    });
                  }}
                  onRestore={() => restoreMedia.mutate({ id: asset.id })}
                  onPermanentDelete={() => setConfirmPermanent({ type: "single-media", id: asset.id, label: asset.title || asset.filename })}
                />
              ))}
            </div>
          )
        )}

      <AlertDialog open={confirmPermanent !== null} onOpenChange={(open) => { if (!open) setConfirmPermanent(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmPermanent?.type === "bulk"
                ? `Permanently delete ${confirmPermanent.count} item${(confirmPermanent.count ?? 0) > 1 ? "s" : ""}?`
                : `Permanently delete "${confirmPermanent?.label}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The item{confirmPermanent?.type === "bulk" ? "s" : ""} will be removed forever.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirm}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function PostRow({
  post,
  checked,
  onCheck,
  onRestore,
  onPermanentDelete,
}: {
  post: TrashedPost;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  const preview = (post.title?.trim() || post.content.slice(0, 80)).trim();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Checkbox checked={checked} onCheckedChange={(v) => onCheck(Boolean(v))} aria-label="Select post" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{preview}</p>
        <p className="text-xs text-muted-foreground">Deleted {relativeTime(post.deletedAt)}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={onRestore}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Restore
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={onPermanentDelete}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete forever
        </Button>
      </div>
    </div>
  );
}

function PieceRow({
  piece,
  checked,
  onCheck,
  onRestore,
  onPermanentDelete,
}: {
  piece: TrashedPiece;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Checkbox checked={checked} onCheckedChange={(v) => onCheck(Boolean(v))} aria-label="Select art piece" />
      {piece.thumbnailUrl ? (
        <img src={piece.thumbnailUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{piece.title}</p>
        <p className="text-xs text-muted-foreground uppercase">{piece.engine} · Deleted {relativeTime(piece.deletedAt)}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={onRestore}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Restore
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={onPermanentDelete}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete forever
        </Button>
      </div>
    </div>
  );
}

function MediaRow({
  asset,
  checked,
  onCheck,
  onRestore,
  onPermanentDelete,
}: {
  asset: TrashedMedia;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  const label = asset.title?.trim() || asset.filename;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Checkbox checked={checked} onCheckedChange={(v) => onCheck(Boolean(v))} aria-label="Select image" />
      <img src={asset.url} alt={asset.altText ?? ""} className="h-10 w-10 shrink-0 rounded object-cover bg-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{asset.mimeType} · Deleted {relativeTime(asset.deletedAt)}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={onRestore}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Restore
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={onPermanentDelete}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete forever
        </Button>
      </div>
    </div>
  );
}
