import { useGetFeedStats, getGetFeedStatsQueryKey } from "@workspace/api-client-react";
import { MessageCircle, FileText } from "lucide-react";

export function FeedStatsWidget() {
  const { data: stats, isLoading } = useGetFeedStats({
    query: { queryKey: getGetFeedStatsQueryKey() }
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-5 w-32 bg-muted rounded"></div>
        <div className="space-y-3">
          <div className="h-10 bg-muted rounded-lg"></div>
          <div className="h-10 bg-muted rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="font-serif text-lg font-bold tracking-tight mb-4">Community Stats</h2>
      
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight leading-none">{stats.totalPosts}</p>
            <p className="text-sm font-medium text-muted-foreground">Total Posts</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight leading-none">{stats.totalComments}</p>
            <p className="text-sm font-medium text-muted-foreground">Total Comments</p>
          </div>
        </div>
      </div>
    </div>
  );
}
