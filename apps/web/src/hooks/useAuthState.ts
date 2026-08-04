import { useState } from "react";
import type { AuthMode, CurrentUser } from "../app/adminTypes";

export function useAuthState() {
  const [authMode, setAuthMode] = useState<AuthMode>("checking");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  return {
    authMode,
    setAuthMode,
    currentUser,
    setCurrentUser,
  };
}
