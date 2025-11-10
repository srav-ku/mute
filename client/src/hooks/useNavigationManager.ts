import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

type View = "inbox" | "groups" | "settings" | "chat" | "group";

interface NavigationState {
  view: View;
  chatId?: string;
  groupId?: string;
}

let exitConfirmCallback: ((shouldExit: boolean) => void) | null = null;
let currentNavState: NavigationState = { view: "inbox" };
let isNavigating = false;

export function useNavigationManager() {
  const [location, setLocation] = useLocation();
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [navState, setNavState] = useState<NavigationState>(() => {
    if (location.startsWith("/chat/")) {
      const chatId = location.split("/chat/")[1];
      return { view: "chat", chatId };
    } else if (location.startsWith("/group/")) {
      const groupId = location.split("/group/")[1];
      return { view: "group", groupId };
    }
    return { view: "inbox" };
  });

  useEffect(() => {
    currentNavState = navState;
  }, [navState]);

  const goToInbox = useCallback(() => {
    if (isNavigating) return;
    isNavigating = true;
    setNavState({ view: "inbox" });
    setLocation("/");
    window.dispatchEvent(
      new CustomEvent("navigation-change", { detail: { view: "inbox" } }),
    );
    setTimeout(() => {
      isNavigating = false;
    }, 100);
  }, [setLocation]);

  const openChat = useCallback(
    (chatId: string) => {
      if (isNavigating) return;
      isNavigating = true;
      const newState = { view: "chat" as View, chatId };
      setNavState(newState);

      const currentPath = window.location.pathname;
      setLocation(`/chat/${chatId}`);

      if (currentPath !== "/chat/${chatId}") {
        window.history.replaceState(null, "", `/chat/${chatId}`);
      }

      window.dispatchEvent(
        new CustomEvent("navigation-change", { detail: newState }),
      );
      setTimeout(() => {
        isNavigating = false;
      }, 100);
    },
    [setLocation],
  );

  const openGroup = useCallback(
    (groupId: string) => {
      if (isNavigating) return;
      isNavigating = true;
      const newState = { view: "group" as View, groupId };
      setNavState(newState);

      const currentPath = window.location.pathname;
      setLocation(`/group/${groupId}`);

      if (currentPath !== `/group/${groupId}`) {
        window.history.replaceState(null, "", `/group/${groupId}`);
      }

      window.dispatchEvent(
        new CustomEvent("navigation-change", { detail: newState }),
      );
      setTimeout(() => {
        isNavigating = false;
      }, 100);
    },
    [setLocation],
  );

  const openGroups = useCallback(() => {
    if (isNavigating) return;
    isNavigating = true;
    const newState = { view: "groups" as View };
    setNavState(newState);
    setLocation("/");
    window.dispatchEvent(
      new CustomEvent("navigation-change", { detail: newState }),
    );
    setTimeout(() => {
      isNavigating = false;
    }, 100);
  }, [setLocation]);

  const openSettings = useCallback(() => {
    if (isNavigating) return;
    isNavigating = true;
    const newState = { view: "settings" as View };
    setNavState(newState);
    setLocation("/");
    window.dispatchEvent(
      new CustomEvent("navigation-change", { detail: newState }),
    );
    setTimeout(() => {
      isNavigating = false;
    }, 100);
  }, [setLocation]);

  const confirmExit = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      exitConfirmCallback = resolve;
      setShowExitDialog(true);
    });
  }, []);

  const handleExitResponse = useCallback((shouldExit: boolean) => {
    setShowExitDialog(false);
    if (exitConfirmCallback) {
      exitConfirmCallback(shouldExit);
      exitConfirmCallback = null;
    }
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (isNavigating) return;

      const state = currentNavState;

      if (
        state.view === "chat" ||
        state.view === "group" ||
        state.view === "groups" ||
        state.view === "settings"
      ) {
        event.preventDefault();
        setNavState({ view: "inbox" });
        setLocation("/");
        window.dispatchEvent(
          new CustomEvent("navigation-change", { detail: { view: "inbox" } }),
        );
      } else if (state.view === "inbox") {
        event.preventDefault();
        confirmExit().then((shouldExit) => {
          if (shouldExit) {
            localStorage.removeItem("chatUserId");
            localStorage.removeItem("chatUsername");
            sessionStorage.removeItem("authToken");
            setLocation("/landing");
          } else {
            setLocation("/");
          }
        });
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [setLocation, confirmExit]);

  return {
    navState,
    showExitDialog,
    goToInbox,
    openChat,
    openGroup,
    openGroups,
    openSettings,
    handleExitResponse,
  };
}
