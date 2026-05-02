import { Switch, Route, Router as WouterRouter, useRoute } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { Navbar } from "@/components/layout/Navbar";
import Home from "@/pages/home";
import SettingsPage from "@/pages/settings";
import PostDetail from "@/pages/post-detail";
import PostEmbed from "@/pages/post-embed";
import UserProfile from "@/pages/user-profile";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppShell() {
  const [isEmbed] = useRoute("/embed/posts/:id");

  if (isEmbed) {
    return (
      <QueryClientProvider client={queryClient}>
        <Switch>
          <Route path="/embed/posts/:id" component={PostEmbed} />
        </Switch>
        <Toaster />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <Navbar />
        <main className="flex-1">
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/posts/:id" component={PostDetail} />
            <Route path="/users/:userId" component={UserProfile} />
            <Route path="/sign-in" component={SignInPage} />
            <Route path="/sign-up" component={SignUpPage} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>

      <Toaster />
    </QueryClientProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <AppShell />
      </WouterRouter>
    </TooltipProvider>
  );
}

export default App;
