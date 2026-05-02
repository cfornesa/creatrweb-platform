import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function SignUpPage() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center py-12 px-4">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl text-center">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground mb-4">
            Sign Up
          </h1>
          <p className="text-muted-foreground mb-8">
            Registration is currently restricted. If you'd like to learn more about the author and this project, please visit the profile page.
          </p>
          <Button asChild className="h-12 w-full justify-center rounded-xl font-semibold">
            <Link href="/users/@cfornesa">Learn More About Me</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
