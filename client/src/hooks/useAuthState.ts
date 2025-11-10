import { useState, useEffect } from "react";

export function useAuthState() {
  const [authState, setAuthState] = useState<{ userId: string; username: string } | null>(() => {
    const userId = localStorage.getItem("chatUserId");
    const username = localStorage.getItem("chatUsername");
    return userId && username ? { userId, username } : null;
  });

  useEffect(() => {
    const checkAuth = () => {
      const userId = localStorage.getItem("chatUserId");
      const username = localStorage.getItem("chatUsername");
      const newState = userId && username ? { userId, username } : null;
      
      setAuthState(prev => {
        if (!prev && newState) {
          return newState;
        }
        if (prev && !newState) {
          return null;
        }
        if (prev && newState && (prev.userId !== newState.userId || prev.username !== newState.username)) {
          return newState;
        }
        return prev;
      });
    };

    const interval = setInterval(checkAuth, 500);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "chatUserId" || e.key === "chatUsername") {
        checkAuth();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return authState;
}
