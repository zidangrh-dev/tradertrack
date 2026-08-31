import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type SessionUser } from '../lib/api';

const AuthContext = createContext<{
  user: SessionUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<SessionUser>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSession().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const value = {
    user,
    loading,
    signIn: async (username: string, password: string) => {
      const { user: u } = await api.login(username, password);
      setUser(u);
      return u;
    },
    signOut: async () => {
      await api.logout();
      setUser(null);
    },
    refreshUser: async () => {
      const u = await api.getSession();
      setUser(u);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
