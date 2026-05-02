import { formatPostDate } from "@/lib/format-date";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { Comment } from "@workspace/api-client-react";
import {
  useDeleteComment,
  useUpdateComment,
  getGetPostQueryKey,
  getGetFeedStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
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
import { useCurrentUser } from "@/hooks/use-current-user";
import { Textarea } from "@/components/ui/textarea";

interface CommentItemProps {
  comment: Comment;
  postId: number;
}

export function CommentItem({ comment, postId }: CommentItemProps) {
  const { currentUser, isOwner } = useCurrentUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(comment.content);

  const deleteComment = useDeleteComment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
        queryClient.invalidateQueries({ queryKey: getGetFeedStatsQueryKey() });
        toast({ title: "Comment deleted" });
      },
      onError: () => {
        setIsDeleting(false);
        toast({ title: "Failed to delete comment", variant: "destructive" });
      }
    }
  });

  const updateComment = useUpdateComment({
    mutation: {
      onSuccess: () => {
        setIsEditing(false);
        queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
        toast({ title: "Comment updated" });
      },
      onError: () => {
        toast({ title: "Failed to update comment", variant: "destructive" });
      },
    },
  });

  const handleDelete = () => {
    setIsDeleting(true);
    deleteComment.mutate({ id: comment.id });
  };

  const canDelete =
    currentUser?.id === comment.authorId ||
    currentUser?.id === (comment as Comment & { authorUserId?: string | null }).authorUserId ||
    isOwner;
  const canEdit = canDelete;

  const handleSave = () => {
    const nextContent = draftContent.trim();
    if (!nextContent) {
      toast({ title: "Comment cannot be empty", variant: "destructive" });
      return;
    }

    if (nextContent === comment.content) {
      setIsEditing(false);
      return;
    }

    updateComment.mutate({
      id: comment.id,
      data: {
        content: nextContent,
      },
    });
  };

  return (
    <div className={`group flex gap-4 p-4 sm:p-5 transition-all duration-300 ${isDeleting ? "opacity-50 scale-95" : ""}`}>
      <Avatar className="h-8 w-8 shrink-0 border border-border">
        <AvatarImage src={comment.authorImageUrl || undefined} alt={comment.authorName} />
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
          {comment.authorName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">
              {comment.authorName}
            </span>
            <span className="text-muted-foreground text-xs font-medium">·</span>
            <span className="text-muted-foreground text-xs" title={new Date(comment.createdAt).toLocaleString()}>
              {formatPostDate(comment.createdAt)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {canEdit && !isEditing ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10 transition-opacity"
                onClick={() => {
                  setDraftContent(comment.content);
                  setIsEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">Edit comment</span>
              </Button>
            ) : null}

            {canDelete && !isEditing ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Delete comment</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone.
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
          <div className="space-y-3">
            <Textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              className="min-h-[110px] resize-y border-border bg-background px-3 py-2 text-sm leading-relaxed"
              disabled={updateComment.isPending}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraftContent(comment.content);
                  setIsEditing(false);
                }}
                disabled={updateComment.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={updateComment.isPending || !draftContent.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {comment.content}
          </p>
        )}
      </div>
    </div>
  );
}

interface CommentListProps {
  comments: Comment[];
  postId: number;
}

export function CommentList({ comments, postId }: CommentListProps) {
  if (comments.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>No comments yet. Be the first to share your thoughts.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {comments.map((comment) => (
        <CommentItem key={comment.id} comment={comment} postId={postId} />
      ))}
    </div>
  );
}
