import { useQueryClient } from "@tanstack/react-query";
import {
  useDeleteMedia,
  useDescribeImage,
  useListMedia,
  useUpdateMediaAltText,
  getListMediaQueryKey,
  type MediaAsset,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { MediaGrid } from "@/components/media/MediaGrid";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { useGetMyAiSettings, getGetMyAiSettingsQueryKey } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function AdminLibraryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isOwner } = useCurrentUser();

  const { data: assets = [], isLoading } = useListMedia({
    query: { queryKey: getListMediaQueryKey() },
  });

  const { data: aiSettings } = useGetMyAiSettings({
    query: { queryKey: getGetMyAiSettingsQueryKey(), enabled: isOwner },
  });

  const { mutate: deleteMedia, isPending: isDeleting } = useDeleteMedia({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
        toast({ title: "Image deleted" });
      },
      onError: () => {
        toast({ title: "Delete failed", description: "Could not delete the image.", variant: "destructive" });
      },
    },
  });

  const { mutateAsync: updateAltText } = useUpdateMediaAltText({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
        toast({ title: "Alt text saved" });
      },
      onError: () => {
        toast({ title: "Save failed", description: "Could not save alt text.", variant: "destructive" });
      },
    },
  });

  const { mutateAsync: describeImage } = useDescribeImage();

  const preferredVendor = aiSettings?.preferredVendorAltText ?? null;
  const firstEnabledVendor = aiSettings?.settings.find((s) => s.enabled && s.configured)?.vendor ?? null;
  const altTextVendor = preferredVendor ?? firstEnabledVendor;

  async function handleSaveAltText(asset: MediaAsset, altText: string) {
    await updateAltText({ fileName: asset.filename, data: { altText: altText || null } });
  }

  async function handleGenerateAltText(asset: MediaAsset, currentAltText?: string): Promise<string> {
    if (!altTextVendor) {
      toast({ title: "No AI vendor configured", description: "Enable a vendor in Admin → AI first.", variant: "destructive" });
      return asset.altText ?? "";
    }
    try {
      const result = await describeImage({
        data: {
          imageUrl: asset.url,
          vendor: altTextVendor,
          ...(currentAltText?.trim() ? { existingAltText: currentAltText.trim() } : {}),
        },
      });
      return result.altText;
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
      return asset.altText ?? "";
    }
  }

  return (
    <AdminLayout
      title="Image Library"
      description={assets.length > 0 ? `${assets.length} image${assets.length === 1 ? "" : "s"}` : undefined}
    >
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <MediaGrid
          assets={assets}
          mode="manage"
          isDeleting={isDeleting}
          onDelete={(asset) => {
            const fileName = asset.filename;
            deleteMedia({ fileName });
          }}
          onSaveAltText={handleSaveAltText}
          onGenerateAltText={altTextVendor ? handleGenerateAltText : undefined}
        />
      )}
    </AdminLayout>
  );
}
