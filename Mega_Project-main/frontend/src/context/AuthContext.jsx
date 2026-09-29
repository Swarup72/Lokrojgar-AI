import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/auth";
import * as usersApi from "../api/users";
import { getAccessToken, setTokens, clearTokens } from "../utils/storage";
import { AUTH_EXPIRED_EVENT } from "../api/client";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workerProfile, setWorkerProfile] = useState(null);
  const [employerProfile, setEmployerProfile] = useState(null);
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  const applyMe = useCallback((me) => {
    setUser(me.user);
    setWorkerProfile(me.workerProfile);
    setEmployerProfile(me.employerProfile);
  }, []);

  const clearSession = useCallback(() => {
    clearTokens();
    setUser(null);
    setWorkerProfile(null);
    setEmployerProfile(null);
  }, []);

  const bootstrap = useCallback(async () => {
    if (!getAccessToken()) {
      setIsBootstrapped(true);
      return;
    }
    try {
      const me = await usersApi.getMe();
      applyMe(me);
    } catch {
      // The client's own 401 handling already tried a refresh - if we're
      // still here with an error, the session is genuinely invalid.
      clearSession();
    } finally {
      setIsBootstrapped(true);
    }
  }, [applyMe, clearSession]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const handleAuthExpired = () => clearSession();
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [clearSession]);

  const login = useCallback(
    async (phone, password) => {
      const result = await authApi.login({ phone, password });
      setTokens(result);
      const me = await usersApi.getMe();
      applyMe(me);
      return me;
    },
    [applyMe]
  );

  const register = useCallback(
    async (payload) => {
      const result = await authApi.register(payload);
      setTokens(result);
      const me = await usersApi.getMe();
      applyMe(me);
      return me;
    },
    [applyMe]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server call fails (e.g. already expired), the local
      // session must still be cleared.
    }
    clearSession();
  }, [clearSession]);

  const refreshBootstrap = useCallback(async () => {
    const me = await usersApi.getMe();
    applyMe(me);
    return me;
  }, [applyMe]);

  const value = useMemo(
    () => ({
      user,
      workerProfile,
      employerProfile,
      isAuthenticated: Boolean(user),
      isBootstrapped,
      login,
      register,
      logout,
      refreshBootstrap,
    }),
    [user, workerProfile, employerProfile, isBootstrapped, login, register, logout, refreshBootstrap]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
