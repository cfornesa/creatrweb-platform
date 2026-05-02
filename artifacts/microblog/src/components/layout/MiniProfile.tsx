import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FileText } from "lucide-react";
import { Link } from "wouter";
import { useCurrentUser } from "@/hooks/use-current-user";

export function MiniProfile() {
  const { currentUser } = useCurrentUser();
  const { data: me, isLoading } = useGetMe({
    query: { 
      queryKey: getGetMeQueryKey(),
      enabled: !!currentUser,
    }
  });

  if (!currentUser) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <Link href={`/users/${currentUser.id}`} className="group relative block">
          <Avatar className="h-16 w-16 border-2 border-background shadow-sm transition-transform group-hover:scale-105">
            <AvatarImage src={currentUser.imageUrl || undefined} alt={currentUser.name || "User"} />
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
              {currentUser.name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
        </Link>
        
        <Link href={`/users/${currentUser.id}`} className="mt-3 font-serif font-bold text-lg hover:underline decoration-primary underline-offset-4">
          {currentUser.name || "You"}
        </Link>
        <p className="text-sm text-muted-foreground">
          {currentUser.email}
        </p>

        {isLoading ? (
          <div className="mt-4 h-8 w-24 bg-muted animate-pulse rounded-full"></div>
        ) : me ? (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <FileText className="h-4 w-4" />
            {me.postCount} {me.postCount === 1 ? 'Post' : 'Posts'}
          </div>
        ) : null}
      </div>
    </div>
  );
}
