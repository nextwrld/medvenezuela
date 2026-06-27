import { trpc } from "@/providers/trpc";
import { useCallback, useMemo } from "react";

export type UnifiedUser = {
  id: number;
  name: string;
  email?: string | null;
  avatar?: string | null;
  role: string;
  authType: "oauth" | "local";
};

export function useAuth() {
  const utils = trpc.useUtils();

  const {
    data: oauthUser,
    isLoading: oauthLoading,
  } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const {
    data: localUser,
    isLoading: localLoading,
  } = trpc.localAuth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
    },
  });

  const logout = useCallback(() => {
    // Always clear local auth token
    localStorage.removeItem("local_auth_token");
    // Always call OAuth logout (no-op if not OAuth)
    logoutMutation.mutate();
    // Refresh page to clear all state
    window.location.reload();
  }, [logoutMutation]);

  const user: UnifiedUser | null = useMemo(() => {
    if (oauthUser) {
      return {
        id: oauthUser.id,
        name: oauthUser.name ?? "Usuario",
        email: oauthUser.email,
        avatar: oauthUser.avatar,
        role: oauthUser.role,
        authType: "oauth" as const,
      };
    }
    if (localUser) {
      return {
        id: localUser.id,
        name: localUser.displayName ?? localUser.username,
        email: null,
        avatar: null,
        role: localUser.role,
        authType: "local" as const,
      };
    }
    return null;
  }, [oauthUser, localUser]);

  const isLoading = oauthLoading || localLoading;
  const isAuthenticated = !!user;
  const isAdmin = user?.role === "admin";

  return useMemo(
    () => ({
      user,
      isAuthenticated,
      isAdmin,
      isLoading: isLoading || logoutMutation.isPending,
      logout,
    }),
    [user, isAuthenticated, isAdmin, isLoading, logoutMutation.isPending, logout]
  );
}
