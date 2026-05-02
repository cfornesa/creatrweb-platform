import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signInWithProvider } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export default function SignInPage() {
  const [pendingProvider, setPendingProvider] = useState<"github" | "google" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const nextPath = new URLSearchParams(window.location.search).get("next");
  const callbackUrl = nextPath
    ? `${window.location.origin}${import.meta.env.BASE_URL}${nextPath.replace(/^\//, "")}`
    : window.location.origin + import.meta.env.BASE_URL;

  async function handleSignIn(provider: "github" | "google") {
    try {
      setErrorMessage(null);
      setPendingProvider(provider);
      await signInWithProvider(provider, callbackUrl);
    } catch (error) {
      setPendingProvider(null);
      setErrorMessage(error instanceof Error ? error.message : "Sign-in failed.");
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center py-12 px-4">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
          <div className="text-center">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
              Sign in
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Join the conversation with an account you already use.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-center rounded-xl font-semibold"
              disabled={pendingProvider !== null}
              onClick={() => handleSignIn("github")}
            >
              {pendingProvider === "github" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Continue with GitHub
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-center rounded-xl font-semibold"
              disabled={pendingProvider !== null}
              onClick={() => handleSignIn("google")}
            >
              {pendingProvider === "google" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Continue with Google
            </Button>
          </div>

          {errorMessage ? (
            <p className="mt-4 text-center text-sm text-destructive">{errorMessage}</p>
          ) : null}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Posting stays owner-only. Signing in lets you comment and like.
          </p>
        </div>
      </div>
    </div>
  );
}
