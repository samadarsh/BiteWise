"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  BiteWiseUser,
  fetchAuthStatus,
  loginWithGoogleApi,
  loginAsGuestApi,
  logoutApi,
  startSwiggyOAuthApi,
} from "./api";

interface AuthContextType {
  user: BiteWiseUser | null;
  isAuthenticated: boolean;
  isSwiggyConnected: boolean;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  loginWithGoogle: (idToken?: string, email?: string, name?: string, avatarUrl?: string) => Promise<boolean>;
  loginAsGuest: () => Promise<boolean>;
  connectSwiggy: () => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BiteWiseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const refreshAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetchAuthStatus();
      if (res.authenticated && res.user) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const loginWithGoogle = useCallback(
    async (idToken?: string, email?: string, name?: string, avatarUrl?: string) => {
      try {
        setIsLoading(true);
        await loginWithGoogleApi({
          id_token: idToken,
          email,
          name,
          avatar_url: avatarUrl,
        });
        await refreshAuth();
        setIsAuthModalOpen(false);
        return true;
      } catch (err) {
        console.error("Google authentication failed:", err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [refreshAuth]
  );

  const loginAsGuest = useCallback(async () => {
    try {
      setIsLoading(true);
      await loginAsGuestApi();
      await refreshAuth();
      setIsAuthModalOpen(false);
      return true;
    } catch (err) {
      console.error("Guest login failed:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refreshAuth]);

  const connectSwiggy = useCallback(async () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    try {
      const res = await startSwiggyOAuthApi();
      if (res.redirect_url) {
        window.location.href = res.redirect_url;
      }
    } catch (err) {
      console.error("Failed to start Swiggy OAuth:", err);
    }
  }, [user]);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await logoutApi();
      setUser(null);
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isSwiggyConnected: !!user?.swiggy_connected,
        isLoading,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        loginWithGoogle,
        loginAsGuest,
        connectSwiggy,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
