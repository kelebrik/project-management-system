import { useState } from "react";
import type { AuthFormState, AuthMode, CurrentUser } from "../app/adminTypes";
import { emptyAuthForm } from "../app/formState";

export function useAuthState() {
  const [authMode, setAuthMode] = useState<AuthMode>("checking");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authForm, setAuthForm] = useState<AuthFormState>(emptyAuthForm);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  return {
    authMode,
    setAuthMode,
    currentUser,
    setCurrentUser,
    authForm,
    setAuthForm,
    authSubmitting,
    setAuthSubmitting,
  };
}
