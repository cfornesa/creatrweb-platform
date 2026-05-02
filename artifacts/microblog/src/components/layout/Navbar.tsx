import { Link, useLocation } from "wouter";
import { LogOut, User as UserIcon, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/use-current-user";
import { signOut } from "@/lib/auth";

export function Navbar() {
  const { currentUser, isAuthenticated } = useCurrentUser();
  const [, setLocation] = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <line x1="9" y1="10" x2="15" y2="10"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </div>
          <span className="font-serif text-lg font-bold tracking-tight text-foreground">Chris Fornesa</span>
        </Link>

        <div className="flex items-center gap-4">
          {!isAuthenticated ? (
            <>
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button asChild className="rounded-full font-medium">
              <Link href="/sign-in">Get Started</Link>
            </Button>
            </>
          ) : null}

          {currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarImage src={currentUser.imageUrl || undefined} alt={currentUser.name || "User"} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {currentUser.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      {currentUser.name && (
                        <p className="font-medium text-sm">{currentUser.name}</p>
                      )}
                      {currentUser.email && (
                        <p className="w-[200px] truncate text-xs text-muted-foreground">
                          {currentUser.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => {
                      const profileSlug = currentUser.username ? `@${currentUser.username}` : currentUser.id;
                      setLocation(`/users/${profileSlug}`);
                    }} 
                    className="cursor-pointer"
                  >
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/settings")} className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onClick={async () => {
                      await signOut(`${window.location.origin}${import.meta.env.BASE_URL}`);
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
