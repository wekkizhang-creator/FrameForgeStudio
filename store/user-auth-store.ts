"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface StudioUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

interface StoredUser extends StudioUser {
  password: string;
}

interface UserAuthState {
  users: StoredUser[];
  currentUserId: string | null;
  loginError: string;
  currentUser: () => StudioUser | null;
  register: (payload: { email: string; password: string; name: string }) => boolean;
  login: (payload: { email: string; password: string }) => boolean;
  logout: () => void;
  clearError: () => void;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const publicUser = (user: StoredUser): StudioUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt
});

export const useUserAuthStore = create<UserAuthState>()(
  persist(
    (set, get) => ({
      users: [
        {
          id: "user-demo",
          email: "demo@guangying.ai",
          name: "光影创作者",
          password: "123456",
          createdAt: new Date().toISOString()
        }
      ],
      currentUserId: null,
      loginError: "",

      currentUser: () => {
        const state = get();
        const user = state.users.find((item) => item.id === state.currentUserId);
        return user ? publicUser(user) : null;
      },

      register: ({ email, password, name }) => {
        const normalizedEmail = normalizeEmail(email);
        const trimmedName = name.trim();

        if (!normalizedEmail || !password || !trimmedName) {
          set({ loginError: "请填写昵称、邮箱和密码。" });
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          set({ loginError: "请输入有效的邮箱地址。" });
          return false;
        }
        if (password.length < 6) {
          set({ loginError: "密码至少需要 6 位。" });
          return false;
        }
        if (get().users.some((user) => user.email === normalizedEmail)) {
          set({ loginError: "该邮箱已注册，请直接登录。" });
          return false;
        }

        const user: StoredUser = {
          id: `user-${Date.now()}`,
          email: normalizedEmail,
          name: trimmedName,
          password,
          createdAt: new Date().toISOString()
        };

        set((state) => ({
          users: [user, ...state.users],
          currentUserId: user.id,
          loginError: ""
        }));
        return true;
      },

      login: ({ email, password }) => {
        const normalizedEmail = normalizeEmail(email);
        const user = get().users.find(
          (item) => item.email === normalizedEmail && item.password === password
        );

        if (!user) {
          set({ loginError: "邮箱或密码不正确。" });
          return false;
        }

        set({ currentUserId: user.id, loginError: "" });
        return true;
      },

      logout: () => set({ currentUserId: null, loginError: "" }),
      clearError: () => set({ loginError: "" })
    }),
    {
      name: "guangying-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        users: state.users,
        currentUserId: state.currentUserId
      })
    }
  )
);
