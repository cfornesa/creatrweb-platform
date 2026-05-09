import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  useCreatePost,
  useUploadMedia,
  getListPostsQueryKey,
  getGetPostsByUserQueryKey,
  getGetFeedStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useOwnerAiVendors } from "@/hooks/use-owner-ai-vendors";
import { useEnabledPlatformConnections } from "@/hooks/use-enabled-platform-connections";
import { RichPostEditor } from "./RichPostEditor";
import { PenSquare } from "lucide-react";

export function ComposePost() {
  const { currentUser, isOwner } = useCurrentUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const { aiVendors } = useOwnerAiVendors();
  const { connections: platformConnections } = useEnabledPlatformConnections();

  const createPost = useCreatePost({
    mutation: {
      onSuccess: () => {
        setIsExpanded(false);
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFeedStatsQueryKey() });
        if (currentUser) {
          queryClient.invalidateQueries({ queryKey: getGetPostsByUserQueryKey(currentUser.id) });
        }
        toast({ title: "Post published" });
      },
      onError: () => {
        toast({ title: "Failed to publish post", variant: "destructive" });
      }
    }
  });

  const uploadMedia = useUploadMedia({
    mutation: {
      onError: () => {
        toast({ title: "Failed to upload image", variant: "destructive" });
      },
    },
  });

  if (!currentUser || !isOwner) return null;

  return (
    <div className="border-b border-border bg-card p-5 sm:p-6">
      <div className="flex gap-4">
        <Avatar className="h-10 w-10 shrink-0 border border-border">
          <AvatarImage src={currentUser.imageUrl || undefined} alt={currentUser.name || "User"} />
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {currentUser.name?.charAt(0) || "U"}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          {!isExpanded ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Ready to publish something new?</p>
                  <p className="text-sm text-muted-foreground">
                    Open the composer only when you want it, then write with formatting, images, and embeds.
                  </p>
                </div>
                <Button type="button" className="rounded-full px-5 font-semibold self-start sm:self-auto" onClick={() => setIsExpanded(true)}>
                  <PenSquare className="mr-2 h-4 w-4" />
                  Start a post
                  

                </Button>
              </div>
            </div>
          ) : (
            <RichPostEditor
              initialContent=""
              placeholder="Publish a post with formatting, images, or embeds..."
              submitLabel="Post"
              cancelLabel="Cancel"
              isSubmitting={createPost.isPending || uploadMedia.isPending}
              aiVendors={aiVendors}
              onCancel={() => setIsExpanded(false)}
              onUpload={async (file) => {
                const uploaded = await uploadMedia.mutateAsync({ data: { file } });
                return uploaded.url;
              }}
              platformConnections={platformConnections}
              onSubmit={({ platformIds, substackSendNewsletter, title, ...rest }) => {
                // platformIds and title are passed alongside the standard body; the API
                // route reads platformIds from req.body before schema parsing.
                createPost.mutate({
                  data: {
                    ...rest,
                    platformIds,
                    title: title || undefined,
                    substackSendNewsletter,
                  } as typeof rest,
                });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
