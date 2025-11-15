import { useAuth } from "@workos-inc/authkit-react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

type UserOrNull = ReturnType<typeof useAuth>["user"];

// redirects to the sign-in page if the user is not signed in
export const useUser = (): UserOrNull => {
  const { user, isLoading, signIn } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      // Use 'state' to return the user to the current page after signing in
      signIn({ state: { returnTo: location.pathname } });
    }
  }, [isLoading, user]);

  return user;
};
