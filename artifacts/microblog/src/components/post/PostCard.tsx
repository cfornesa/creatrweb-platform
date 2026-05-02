import { Link, useLocation } from "wouter";
import { MessageCircle, Pencil, Trash2, Maximize, Code, Share2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatPostDate } from "@/lib/format-date";
import type { Post, PostWithComments, PostsPage } from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useDeletePost,
  useUpdatePost,
  useUploadMedia,
  getListPostsQueryKey,
  getGetPostQueryKey,
  getGetPostsByUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PostContent } from "./PostContent";
import { RichPostEditor } from "./RichPostEditor";
import { SharePostDialog } from "./SharePostDialog";

interface PostCardProps {
  post: Post;
  isDetail?: boolean;
}

export function PostCard({ post, isDetail = false }: PostCardProps) {
  const { currentUser, isOwner } = useCurrentUser();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [displayPost, setDisplayPost] = useState(post);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(post.content);

  const mergePost = (base: Post, patch: Partial<Post>): Post => ({
    ...base,
    ...patch,
    authorId: patch.authorId ?? base.authorId,
    authorName: patch.authorName ?? base.authorName,
    authorImageUrl: patch.authorImageUrl ?? base.authorImageUrl,
    content: patch.content ?? base.content,
    contentFormat: patch.contentFormat ?? base.contentFormat,
    commentCount: patch.commentCount ?? base.commentCount,
    createdAt: patch.createdAt ?? base.createdAt,
  });

  useEffect(() => {
    setDisplayPost(post);
  }, [post]);

  const deletePost = useDeletePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        if (currentUser) {
          queryClient.invalidateQueries({ queryKey: getGetPostsByUserQueryKey(currentUser.id) });
        }
        toast({ title: "Post deleted" });
      },
      onError: () => {
        setIsDeleting(false);
        toast({ title: "Failed to delete post", variant: "destructive" });
      }
    }
  });

  const updatePost = useUpdatePost({
    mutation: {
      onSuccess: (updatedPost) => {
        setDisplayPost((existing) => mergePost(existing, updatedPost));
        queryClient.setQueriesData(
          { queryKey: getListPostsQueryKey() },
          (existing: PostsPage | undefined) =>
            existing
              ? {
                  ...existing,
                  posts: existing.posts.map((candidate) =>
                    candidate.id === updatedPost.id ? mergePost(candidate, updatedPost) : candidate,
                  ),
                }
              : existing,
        );

        if (currentUser) {
          queryClient.setQueriesData(
            { queryKey: getGetPostsByUserQueryKey(currentUser.id) },
            (existing: PostsPage | undefined) =>
              existing
                ? {
                    ...existing,
                    posts: existing.posts.map((candidate) =>
                      candidate.id === updatedPost.id ? mergePost(candidate, updatedPost) : candidate,
                    ),
                  }
                : existing,
          );
        }

        queryClient.setQueryData(
          getGetPostQueryKey(post.id),
          (existing: PostWithComments | undefined) =>
            existing
              ? {
                  ...existing,
                  post: mergePost(existing.post, updatedPost),
                }
              : existing,
        );

        setIsEditing(false);
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(post.id) });
        if (currentUser) {
          queryClient.invalidateQueries({ queryKey: getGetPostsByUserQueryKey(currentUser.id) });
        }
        toast({ title: "Post updated" });
      },
      onError: () => {
        toast({ title: "Failed to update post", variant: "destructive" });
      },
    },
  });

  const uploadMedia = useUploadMedia({
    mutation: {
      onError: () => {
        toast({ title: "Failed to upload image", variant: "destructive" });
      },
    },
  });

  useEffect(() => {
    if (!isEditing) {
      setDraftContent(displayPost.content);
    }
  }, [displayPost.content, isEditing]);

  const handleDelete = () => {
    setIsDeleting(true);
    deletePost.mutate({ id: displayPost.id });
  };

  const handleEmbed = (event: React.MouseEvent) => {
    event.stopPropagation();
    const embedUrl = `${window.location.origin}/embed/posts/${displayPost.id}`;
    const iframeCode = `<iframe src="${embedUrl}" width="100%" height="400" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 12px;"></iframe>`;
    
    navigator.clipboard.writeText(iframeCode).then(() => {
      toast({ 
        title: "Embed code copied", 
        description: "Iframe code is ready to paste." 
      });
    }).catch(() => {
      toast({ 
        title: "Failed to copy", 
        description: "Please copy the URL manually: " + embedUrl,
        variant: "destructive"
      });
    });
  };

  const isOwnerAuthorPost =
    isOwner &&
    (currentUser?.id === displayPost.authorId ||
      currentUser?.id === (displayPost as Post & { authorUserId?: string | null }).authorUserId);

  const canDelete = isOwnerAuthorPost;
  const canEdit = isOwnerAuthorPost;

  const handleCommentClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isDetail) {
      document.getElementById(`comments-${displayPost.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    setLocation(`/posts/${displayPost.id}`);
  };

  const handleEditStart = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDraftContent(displayPost.content);
    setIsEditing(true);
  };

  const content = (
    <div className={`group relative flex gap-4 p-5 sm:p-6 transition-colors ${!isDetail && !isDeleting && !isEditing ? "hover:bg-accent/30" : ""} ${isDeleting ? "opacity-50 scale-95 transition-all duration-300" : "transition-all duration-300"}`}>
      <Link href={`/users/${displayPost.authorId}`} className="shrink-0 z-10" onClick={(e) => e.stopPropagation()}>
        <Avatar className="h-10 w-10 border border-border ring-2 ring-transparent transition-all group-hover:ring-primary/20">
          <AvatarImage src={displayPost.authorImageUrl || undefined} alt={displayPost.authorName} />
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {(displayPost.authorName?.charAt(0) || "U").toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link 
              href={`/users/${displayPost.authorId}`} 
              className="font-semibold text-foreground hover:underline z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {displayPost.authorName}
            </Link>
            <span className="text-muted-foreground text-xs font-medium">·</span>
            <span className="text-muted-foreground text-xs" title={new Date(displayPost.createdAt).toLocaleString()}>
              {formatPostDate(displayPost.createdAt)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {!isEditing && !isDetail ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 z-10 transition-colors order-last group-hover:order-first"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation(`/posts/${displayPost.id}`);
                }}
                disabled={isDeleting}
              >
                <Maximize className="h-4 w-4" />
                <span className="sr-only">Expand post</span>
              </Button>
            ) : null}

            {canEdit && !isEditing ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10 z-10 transition-opacity order-1"
                onClick={handleEditStart}
                disabled={isDeleting}
              >
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Edit post</span>
              </Button>
            ) : null}

            {canDelete && !isEditing ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 z-10 transition-opacity order-2"
                    onClick={(e) => e.stopPropagation()}
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete post</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e: React.MouseEvent) => e.stopPropagation()} className="z-[100]">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your post and all its comments.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            <RichPostEditor
              initialContent={draftContent}
              submitLabel="Save"
              cancelLabel="Cancel"
              isSubmitting={updatePost.isPending || uploadMedia.isPending}
              onCancel={() => setIsEditing(false)}
              onUpload={async (file) => {
                const uploaded = await uploadMedia.mutateAsync({ data: { file } });
                return uploaded.url;
              }}
              onSubmit={(payload) => {
                setDraftContent(payload.content);
                updatePost.mutate({
                  id: displayPost.id,
                  data: payload,
                });
              }}
            />
          </div>
        ) : (
          <PostContent content={displayPost.content} contentFormat={displayPost.contentFormat} />
        )}

        <div className="flex items-center gap-2 pt-2">
          <div className="flex items-center">
            {!isDetail ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="relative z-10 -ml-3 h-auto gap-1.5 rounded-full px-3 py-2 text-muted-foreground transition-colors group-hover:text-primary"
                onClick={handleCommentClick}
                disabled={isEditing}
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs font-medium">{displayPost.commentCount}</span>
                <span className="sr-only">View comments</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="relative z-10 -ml-3 h-auto rounded-full px-3 py-2 text-sm font-medium text-muted-foreground"
                onClick={handleCommentClick}
                disabled={isEditing}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" />
                {displayPost.commentCount} {displayPost.commentCount === 1 ? "comment" : "comments"}
              </Button>
            )}
          </div>

          {!isEditing ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="relative z-10 h-auto gap-1.5 rounded-full px-3 py-2 text-muted-foreground transition-colors hover:text-primary hover:bg-primary/10"
                onClick={handleEmbed}
                disabled={isDeleting}
              >
                <Code className="h-4 w-4" />
                <span className="hidden sm:inline text-xs font-medium uppercase tracking-tight">Embed</span>
              </Button>

              <SharePostDialog post={displayPost}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative z-10 h-auto gap-1.5 rounded-full px-3 py-2 text-muted-foreground transition-colors hover:text-primary hover:bg-primary/10"
                  disabled={isDeleting}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Share2 className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs font-medium uppercase tracking-tight">Share</span>
                </Button>
              </SharePostDialog>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (isDetail) {
    return <div className="border-b border-border bg-card">{content}</div>;
  }

  return (
    <div className={`border-b border-border bg-card relative overflow-hidden block ${isEditing ? "" : "cursor-pointer"}`}>
      {!isEditing ? (
      <Link href={`/posts/${displayPost.id}`} className="absolute inset-0 z-0">
        <span className="sr-only">View post</span>
      </Link>
      ) : null}
      {content}
    </div>
  );
}
