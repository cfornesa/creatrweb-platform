import { useState } from "react";
import { Save, Sparkles, Trash2 } from "lucide-react";
import type { MediaAsset } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  assets: MediaAsset[];
  mode: "select" | "manage";
  selectedUrl?: string;
  onSelect?: (asset: MediaAsset) => void;
  onDelete?: (asset: MediaAsset) => void;
  isDeleting?: boolean;
  onSaveAltText?: (asset: MediaAsset, altText: string) => Promise<void>;
  onGenerateAltText?: (asset: MediaAsset, currentAltText: string) => Promise<string>;
};

export function MediaGrid({ assets, mode, selectedUrl, onSelect, onDelete, isDeleting, onSaveAltText, onGenerateAltText }: Props) {
  const [altTexts, setAltTexts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  function getAltText(asset: MediaAsset): string {
    return altTexts[asset.id] !== undefined ? altTexts[asset.id]! : (asset.altText ?? "");
  }

  async function handleSave(asset: MediaAsset) {
    if (!onSaveAltText) return;
    setSavingId(asset.id);
    try {
      await onSaveAltText(asset, getAltText(asset));
      setAltTexts((prev) => {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  }

  async function handleGenerate(asset: MediaAsset) {
    if (!onGenerateAltText) return;
    setGeneratingId(asset.id);
    try {
      const generated = await onGenerateAltText(asset, getAltText(asset));
      setAltTexts((prev) => ({ ...prev, [asset.id]: generated }));
    } finally {
      setGeneratingId(null);
    }
  }

  if (assets.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        No images uploaded yet
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {assets.map((asset) => {
        const isSelected = asset.url === selectedUrl;
        const currentAltText = getAltText(asset);
        const isDirty = altTexts[asset.id] !== undefined && altTexts[asset.id] !== (asset.altText ?? "");
        return (
          <div key={asset.id} className="group relative">
            <button
              type="button"
              onClick={() => {
                if (mode === "select") {
                  onSelect?.(asset);
                } else {
                  setSelectedId((prev) => (prev === asset.id ? null : asset.id));
                }
              }}
              className={cn(
                "relative w-full overflow-hidden rounded-md border bg-muted transition-all cursor-pointer",
                mode === "select" && "hover:ring-2 hover:ring-primary/50 focus:outline-none focus:ring-2 focus:ring-primary",
                mode === "manage" && "hover:ring-2 hover:ring-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/30",
                (isSelected || (mode === "manage" && selectedId === asset.id)) && "ring-2 ring-primary",
              )}
              aria-label={`Select ${asset.filename}`}
              aria-pressed={isSelected || (mode === "manage" && selectedId === asset.id)}
            >
              <img
                src={asset.url}
                alt={currentAltText || ""}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                  <div className="rounded-full bg-primary p-0.5">
                    <svg className="h-3 w-3 text-primary-foreground" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              )}
            </button>
            {mode === "manage" && onDelete && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                onClick={() => onDelete(asset)}
                disabled={isDeleting}
                aria-label={`Delete ${asset.filename}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            <p className="mt-1 truncate px-0.5 text-[10px] text-muted-foreground">
              {new Date(asset.uploadedAt).toLocaleDateString()}
            </p>
            {mode === "manage" && selectedId === asset.id && (onSaveAltText || onGenerateAltText) && (
              <div className="mt-1 flex gap-1">
                <input
                  type="text"
                  value={currentAltText}
                  onChange={(e) => setAltTexts((prev) => ({ ...prev, [asset.id]: e.target.value }))}
                  placeholder="Alt text"
                  maxLength={500}
                  className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  aria-label={`Alt text for ${asset.filename}`}
                />
                {onGenerateAltText && (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-5 w-5 shrink-0 p-0"
                    onClick={() => handleGenerate(asset)}
                    disabled={generatingId === asset.id}
                    aria-label="Generate alt text with AI"
                    title="Generate alt text with AI"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                  </Button>
                )}
                {onSaveAltText && (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={cn("h-5 w-5 shrink-0 p-0", isDirty && "border-primary text-primary")}
                    onClick={() => handleSave(asset)}
                    disabled={savingId === asset.id || !isDirty}
                    aria-label="Save alt text"
                    title="Save alt text"
                  >
                    <Save className="h-2.5 w-2.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
