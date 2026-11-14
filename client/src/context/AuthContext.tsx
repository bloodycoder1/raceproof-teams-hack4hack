import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, ApiError } from '../lib/api.js';
import type { User, TeamDetails } from '../types/index.js';

interface AuthContextType {
  user: User | null;
  currentTeam: TeamDetails | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    email: string;
    password: string;
    name: string;
    timezone: string;
    skills: string[];
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshTeam: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setCurrentTeam: React.Dispatch<React.SetStateAction<TeamDetails | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [currentTeam, setCurrentTeam] = useState<TeamDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTeam = useCallback(async () => {
    try {
      const res = await apiRequest<{ teamData: TeamDetails | null }>('/users/me/team?hackathonId=1');
      setCurrentTeam(res.teamData);
    } catch {
      setCurrentTeam(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiRequest<{ user: User }>('/users/me');
      setUser(res.user);
      await refreshTeam();
    } catch (err) {
      setUser(null);
      setCurrentTeam(null);
    } finally {
      setLoading(false);
    }
  }, [refreshTeam]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await refreshUser();
  };

  const register = async (payload: {
    email: string;
    password: string;
    name: string;
    timezone: string;
    skills: string[];
  }) => {
    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await refreshUser();
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setCurrentTeam(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        currentTeam,
        loading,
        login,
        register,
        logout,
        refreshTeam,
        refreshUser,
        setCurrentTeam,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
