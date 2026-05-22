import { useRef, useState } from "react";
import { ImagePlus, Link, Images, Save, Sparkles } from "lucide-react";
import {
  useDescribeImage,
  useListMedia,
  useUpdateMediaAltText,
  useUploadMedia,
  getListMediaQueryKey,
  type MediaAsset,
  type DescribeImageBodyVendor,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { MediaGrid } from "./MediaGrid";
import { getUploadErrorMessage } from "@/components/post/upload-error";
import { cn } from "@/lib/utils";

type Tab = "library" | "upload" | "url";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string, altText?: string) => void;
  currentUrl?: string;
  /** Preferred vendor id for AI alt text generation. */
  altTextVendor?: string | null;
};

const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif,image/avif";

export function FeaturedImagePicker({ open, onOpenChange, onSelect, currentUrl, altTextVendor }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const [urlInput, setUrlInput] = useState("");
  const [urlAltText, setUrlAltText] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [altTextDraft, setAltTextDraft] = useState("");
  const [isDirtyAlt, setIsDirtyAlt] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<MediaAsset | null>(null);
  const [isGeneratingAlt, setIsGeneratingAlt] = useState(false);
  const [isSavingAlt, setIsSavingAlt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: assets = [], isLoading: isLoadingLibrary } = useListMedia({
    query: { enabled: open, queryKey: getListMediaQueryKey() },
  });

  const { mutateAsync: uploadMedia, isPending: isUploading } = useUploadMedia();
  const { mutateAsync: updateAltText } = useUpdateMediaAltText();
  const { mutateAsync: describeImage } = useDescribeImage();

  function syncAltText(asset: MediaAsset) {
    setSelectedAsset(asset);
    setAltTextDraft(asset.altText ?? "");
    setIsDirtyAlt(false);
  }

  function handleSelectAsset(asset: MediaAsset) {
    if (isDirtyAlt && selectedAsset) {
      setPendingAsset(asset);
      return;
    }
    syncAltText(asset);
  }

  function handleDiscardAndSwitch() {
    if (pendingAsset) {
      syncAltText(pendingAsset);
      setPendingAsset(null);
    }
  }

  async function handleSaveAltAndSwitch() {
    if (selectedAsset) {
      await saveAltText(selectedAsset, altTextDraft);
    }
    if (pendingAsset) {
      syncAltText(pendingAsset);
      setPendingAsset(null);
    }
  }

  async function saveAltText(asset: MediaAsset, text: string) {
    setIsSavingAlt(true);
    try {
      await updateAltText({ fileName: asset.filename, data: { altText: text || null } });
      queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
      setIsDirtyAlt(false);
      toast({ title: "Alt text saved" });
    } catch {
      toast({ title: "Save failed", description: "Could not save alt text.", variant: "destructive" });
    } finally {
      setIsSavingAlt(false);
    }
  }

  async function handleGenerateAlt() {
    if (!selectedAsset || !altTextVendor) return;
    setIsGeneratingAlt(true);
    try {
      const result = await describeImage({
        data: {
          imageUrl: selectedAsset.url,
          vendor: altTextVendor as DescribeImageBodyVendor,
          ...(altTextDraft.trim() ? { existingAltText: altTextDraft.trim() } : {}),
        },
      });
      setAltTextDraft(result.altText);
      setIsDirtyAlt(result.altText !== (selectedAsset.altText ?? ""));
    } catch (error: any) {
      const code = error?.data?.code ?? error?.response?.data?.code;
      if (code === "vision_not_supported") {
        toast({
          title: "Vision not supported",
          description: "This AI model does not support image analysis. Choose a vision-capable model in Admin → AI → Task Preferences.",
          variant: "destructive",
        });
      } else {
        toast({ title: "AI failed", description: "Could not generate alt text.", variant: "destructive" });
      }
    } finally {
      setIsGeneratingAlt(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";

    try {
      const result = await uploadMedia({ data: { file } });
      onSelect(result.url, undefined);
      onOpenChange(false);
      toast({ title: "Featured image set", description: "Uploaded image selected." });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: getUploadErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  function handleUrlSubmit() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    onSelect(trimmed, urlAltText.trim() || undefined);
    onOpenChange(false);
    setUrlInput("");
    setUrlAltText("");
  }

  const tabs: { id: Tab; label: string; icon: typeof Images }[] = [
    { id: "library", label: "Library", icon: Images },
    { id: "upload", label: "Upload", icon: ImagePlus },
    { id: "url", label: "URL", icon: Link },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Set Featured Image</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 border-b border-border pb-0">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 pb-2 text-sm transition-colors border-b-2 -mb-px",
                  activeTab === id
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-[240px]">
            {activeTab === "library" && (
              <div className="space-y-3">
                {isLoadingLibrary ? (
                  <div className="flex h-40 items-center justify-center">
                    <Spinner className="h-5 w-5" />
                  </div>
                ) : (
                  <MediaGrid
                    assets={assets}
                    mode="select"
                    selectedUrl={selectedAsset?.url ?? currentUrl}
                    onSelect={handleSelectAsset}
                  />
                )}

                {selectedAsset && (
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Alt text for selected image</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={altTextDraft}
                        onChange={(e) => {
                          setAltTextDraft(e.target.value);
                          setIsDirtyAlt(e.target.value !== (selectedAsset.altText ?? ""));
                        }}
                        placeholder="Describe this image for screen readers"
                        maxLength={500}
                        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                      {altTextVendor && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0 gap-1.5"
                          onClick={handleGenerateAlt}
                          disabled={isGeneratingAlt}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {isGeneratingAlt ? "Generating…" : "AI"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn("shrink-0 gap-1.5", isDirtyAlt && "border-primary text-primary")}
                        onClick={() => saveAltText(selectedAsset, altTextDraft)}
                        disabled={!isDirtyAlt || isSavingAlt}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {isSavingAlt ? "Saving…" : "Save"}
                      </Button>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        onClick={() => {
                          onSelect(selectedAsset.url, altTextDraft || undefined);
                          onOpenChange(false);
                        }}
                      >
                        Use this image
                      </Button>
                    </div>
                  </div>
                )}

                {!selectedAsset && assets.length > 0 && (
                  <p className="text-center text-xs text-muted-foreground">Select an image to use it as the featured image</p>
                )}
              </div>
            )}

            {activeTab === "upload" && (
              <div className="flex flex-col items-center justify-center gap-4 py-8">
                <div
                  className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-primary/50 hover:bg-muted/30"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Click to upload an image"
                >
                  {isUploading ? (
                    <>
                      <Spinner className="h-6 w-6" />
                      <p className="text-sm text-muted-foreground">Uploading…</p>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-8 w-8 text-muted-foreground" />
                      <div className="text-center">
                        <p className="text-sm font-medium">Click to upload</p>
                        <p className="mt-1 text-xs text-muted-foreground">PNG, JPEG, WebP, GIF, AVIF · max 8 MB</p>
                      </div>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES}
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
              </div>
            )}

            {activeTab === "url" && (
              <div className="flex flex-col gap-3 py-4">
                <label className="text-sm font-medium" htmlFor="featured-image-url-input">
                  External image URL
                </label>
                <div className="flex gap-2">
                  <input
                    id="featured-image-url-input"
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button
                    type="button"
                    onClick={handleUrlSubmit}
                    disabled={!urlInput.trim()}
                  >
                    Use URL
                  </Button>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground" htmlFor="featured-image-alt-input">
                    Alt text (optional)
                  </label>
                  <input
                    id="featured-image-alt-input"
                    type="text"
                    placeholder="Describe this image for screen readers"
                    value={urlAltText}
                    onChange={(e) => setUrlAltText(e.target.value)}
                    maxLength={500}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {urlInput.trim() && (
                  <img
                    src={urlInput.trim()}
                    alt="Preview"
                    className="mt-1 h-24 w-full rounded-md border border-border object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    onLoad={(e) => { (e.target as HTMLImageElement).style.display = ""; }}
                  />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingAsset} onOpenChange={(v) => { if (!v) setPendingAsset(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved alt text</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to the alt text. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAsset(null)}>Keep editing</AlertDialogCancel>
            <AlertDialogCancel onClick={handleDiscardAndSwitch}>Discard</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAltAndSwitch}>Save &amp; switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
