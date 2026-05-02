import { useMemo, useState } from "react";
import { useListPosts, getListPostsQueryKey, useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { PostCard } from "@/components/post/PostCard";
import { ComposePost } from "@/components/post/ComposePost";
import { FeedStatsWidget } from "@/components/layout/FeedStatsWidget";
import { MiniProfile } from "@/components/layout/MiniProfile";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { Post } from "@workspace/api-client-react";

type SortMode = "newest" | "oldest" | "most-commented";
type FilterMode = "all" | "has-comments" | "has-media" | "rich-posts";

function postHasMedia(post: Post) {
  if (post.contentFormat !== "html") {
    return false;
  }

  return /<(img|iframe)\b/i.test(post.content);
}

export default function Home() {
  const { isAuthenticated } = useCurrentUser();
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const { data: postsPage, isLoading } = useListPosts(
    { page: 1, limit: 50 },
    { query: { queryKey: getListPostsQueryKey({ page: 1, limit: 50 }) } }
  );
  
  const { data: health } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey()
    }
  });

  const visiblePosts = useMemo(() => {
    const basePosts = [...(postsPage?.posts ?? [])];

    const filteredPosts = basePosts.filter((post) => {
      switch (filterMode) {
        case "has-comments":
          return post.commentCount > 0;
        case "has-media":
          return postHasMedia(post);
        case "rich-posts":
          return post.contentFormat === "html";
        case "all":
        default:
          return true;
      }
    });

    filteredPosts.sort((left, right) => {
      switch (sortMode) {
        case "oldest":
          return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        case "most-commented":
          if (right.commentCount !== left.commentCount) {
            return right.commentCount - left.commentCount;
          }
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        case "newest":
        default:
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }
    });

    return filteredPosts;
  }, [filterMode, postsPage?.posts, sortMode]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        <main className="space-y-6">
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            {isAuthenticated ? (
              <ComposePost />
            ) : null}

            {!isAuthenticated ? (
              <div className="border-b border-border bg-primary/5 p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    <line x1="9" y1="10" x2="15" y2="10"/>
                    <line x1="9" y1="14" x2="15" y2="14"/>
                  </svg>
                </div>
                <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground mb-2">Buenas at Kumusta!</h2>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">Welcome to my digital garden where I cultivate my thoughts, feelings, hopes, dreams, and more.</p>
                <Button asChild className="rounded-full px-8 font-semibold shadow-sm">
                  <Link href="/users/@cfornesa">Learn More About Me</Link>
                </Button>
              </div>
            ) : null}

            {!isLoading && postsPage && postsPage.posts.length > 0 ? (
              <div className="border-b border-border bg-muted/20 px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Posts</p>
                    <p className="text-sm text-muted-foreground">
                      Sort and filter through my posts.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Sort</span>
                      <select
                        value={sortMode}
                        onChange={(event) => setSortMode(event.target.value as SortMode)}
                        className="min-w-[170px] rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary"
                      >
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="most-commented">Most Commented</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Filter</span>
                      <select
                        value={filterMode}
                        onChange={(event) => setFilterMode(event.target.value as FilterMode)}
                        className="min-w-[170px] rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary"
                      >
                        <option value="all">All Posts</option>
                        <option value="has-comments">Has Comments</option>
                        <option value="has-media">Has Media</option>
                        <option value="rich-posts">Rich Posts</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            {isLoading ? (
              <div className="divide-y divide-border/50">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="p-6 space-y-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted"></div>
                      <div className="space-y-2">
                        <div className="h-4 w-24 bg-muted rounded"></div>
                        <div className="h-3 w-16 bg-muted rounded"></div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 w-full bg-muted rounded"></div>
                      <div className="h-4 w-2/3 bg-muted rounded"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : postsPage?.posts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <p>No posts yet. It's quiet here...</p>
              </div>
            ) : visiblePosts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <p>No posts match that filter yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {visiblePosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>
        </main>

        <aside className="space-y-6 mt-8 lg:mt-0">
          {isAuthenticated ? (
            <MiniProfile />
          ) : null}
          
          <FeedStatsWidget />
          
          <div className="rounded-2xl bg-muted/50 p-6 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground mb-2">About This Platform</h3>
            <p>A space where I share my thoughts, ideas, and experiences with the world.</p>
            <p>Built with React using Replit, Claude Code, Codex, and Gemini CLI.</p>
            <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between text-xs">
              <span>Copyright &copy; {new Date().getFullYear()} Chris Fornesa.</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${health?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span>{health?.status === 'ok' ? 'API Online' : 'API Offline'}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
