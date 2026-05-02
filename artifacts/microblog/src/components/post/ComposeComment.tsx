import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCreateComment, getGetPostQueryKey, getGetFeedStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

const MAX_CHARS = 500;

const formSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty").max(MAX_CHARS, `Comment must be less than ${MAX_CHARS} characters`),
});

interface ComposeCommentProps {
  postId: number;
  shouldFocus?: boolean;
}

export function ComposeComment({ postId, shouldFocus = false }: ComposeCommentProps) {
  const { currentUser, isAuthenticated } = useCurrentUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      content: "",
    },
  });

  const contentValue = form.watch("content");
  const charsRemaining = MAX_CHARS - (contentValue?.length || 0);
  const isNearLimit = charsRemaining <= 20;
  const isOverLimit = charsRemaining < 0;

  const createComment = useCreateComment({
    mutation: {
      onSuccess: () => {
        form.reset();
        setIsFocused(false);
        queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
        queryClient.invalidateQueries({ queryKey: getGetFeedStatsQueryKey() });
        toast({ title: "Comment published" });
      },
      onError: () => {
        toast({ title: "Failed to publish comment", variant: "destructive" });
      }
    }
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createComment.mutate({ postId, data: values });
  };

  useEffect(() => {
    if (!shouldFocus || !currentUser || !isAuthenticated) {
      return;
    }

    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentUser, isAuthenticated, shouldFocus]);

  if (!currentUser || !isAuthenticated) return null;

  return (
    <div className="p-4 sm:p-5 bg-card/50 transition-colors duration-200" data-focused={isFocused}>
      <div className="flex gap-3 sm:gap-4">
        <Avatar className="h-8 w-8 sm:h-10 sm:w-10 shrink-0 border border-border">
          <AvatarImage src={currentUser.imageUrl || undefined} alt={currentUser.name || "User"} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm font-medium">
            {currentUser.name?.charAt(0) || "U"}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        id={`comment-compose-${postId}`}
                        placeholder="Reply to this post..."
                        className="min-h-[60px] sm:min-h-[80px] resize-none border-border bg-background px-3 py-2 text-sm sm:text-base focus-visible:ring-1 focus-visible:ring-primary placeholder:text-muted-foreground/60 transition-all rounded-xl"
                        {...field}
                        ref={(element) => {
                          textareaRef.current = element;
                          field.ref(element);
                        }}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => {
                          field.onBlur();
                          setIsFocused(false);
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className={`flex items-center justify-between pt-1 transition-opacity duration-200 ${isFocused || contentValue.length > 0 ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>
                <div className="flex items-center gap-4">
                  <span className={`text-xs font-medium transition-colors ${isOverLimit ? 'text-destructive' : isNearLimit ? 'text-secondary' : 'text-muted-foreground'}`}>
                    {charsRemaining}
                  </span>
                </div>
                
                <Button 
                  type="submit" 
                  size="sm"
                  disabled={createComment.isPending || !contentValue.trim() || isOverLimit}
                  className="rounded-full px-5 font-semibold shadow-sm"
                >
                  {createComment.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Reply
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
