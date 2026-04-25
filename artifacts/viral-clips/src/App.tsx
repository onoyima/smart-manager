import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiListVideos } from "@/lib/apiClient";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Upload from "@/pages/upload";
import Videos from "@/pages/videos";
import History from "@/pages/history";
import VideoDetail from "@/pages/video-detail";

import Editor from "@/pages/editor";
import ClipDetail from "@/pages/clip-detail";
import Projects from "@/pages/projects";

import { Login } from "@/pages/login";
import { Register } from "@/pages/register";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: any }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/upload" component={() => <ProtectedRoute component={Upload} />} />
      <Route path="/videos" component={() => <ProtectedRoute component={Videos} />} />
      <Route path="/history" component={() => <ProtectedRoute component={History} />} />
      <Route path="/videos/:id" component={() => <ProtectedRoute component={VideoDetail} />} />
      <Route path="/editor" component={() => <ProtectedRoute component={Editor} />} />
      <Route path="/editor/:projectId" component={() => <ProtectedRoute component={Editor} />} />
      <Route path="/projects" component={() => <ProtectedRoute component={Projects} />} />
      <Route path="/clips/:videoId/:clipId" component={() => <ProtectedRoute component={ClipDetail} />} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

