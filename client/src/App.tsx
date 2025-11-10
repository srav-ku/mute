import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TransitionOverlay } from "@/components/TransitionOverlay";
import { setUserPresence } from "@/lib/firebase";
import { useAuthState } from "@/hooks/useAuthState";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ConversationsListPage from "@/pages/ConversationsListPage";
import ProfilePage from "@/pages/ProfilePage";

function Router() {
  const authState = useAuthState();
  const [, setLocation] = useLocation();
  const isLoading = authState === undefined;

  useEffect(() => {
    const userId = localStorage.getItem("chatUserId");
    const authToken = sessionStorage.getItem("authToken");

    if (userId && !authToken) {
      sessionStorage.setItem("authToken", `${userId}-${Date.now()}`);
    }
  }, [authState]);

  useEffect(() => {
    const handlePopState = () => {
      const userId = localStorage.getItem("chatUserId");
      const authToken = sessionStorage.getItem("authToken");
      
      if (!userId || !authToken || !authToken.startsWith(`${userId}-`)) {
        queryClient.clear();
        setLocation("/landing");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [setLocation]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const isAuthenticated = authState !== null;

  return (
    <Switch>
      <Route path="/landing" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/">
        {isAuthenticated ? <ConversationsListPage /> : <LandingPage />}
      </Route>
      <Route path="/chat/:conversationId">
        {isAuthenticated ? <ConversationsListPage /> : <Redirect to="/landing" />}
      </Route>
      <Route path="/group/:groupId">
        {isAuthenticated ? <ConversationsListPage /> : <Redirect to="/landing" />}
      </Route>
      <Route path="/profile">
        {isAuthenticated ? <ProfilePage /> : <Redirect to="/landing" />}
      </Route>
    </Switch>
  );
}

function App() {
  const authState = useAuthState();

  useEffect(() => {
    if (!authState) return;

    const { userId, username } = authState;

    setUserPresence(userId, username, true).catch(console.error);

    const handleBeforeUnload = () => {
      setUserPresence(userId, username, false).catch(console.error);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    const keepAliveInterval = setInterval(() => {
      setUserPresence(userId, username, true).catch(console.error);
    }, 30000);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(keepAliveInterval);
      setUserPresence(userId, username, false).catch(console.error);
    };
  }, [authState]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <TransitionOverlay />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
