"use client";

import { create } from "zustand";
import { platformModels, routePolicies } from "@/lib/mock-data";
import type { ModelProvider, RoutePolicy } from "@/lib/types";

interface AdminState {
  models: ModelProvider[];
  policies: RoutePolicy[];
  selectedPolicyId: string;
  lastSyncedAt: string;
  selectedProviderId: string;
  selectPolicy: (id: string) => void;
  selectProvider: (id: string) => void;
  togglePolicy: (id: string) => void;
  updatePolicy: (id: string, patch: Partial<RoutePolicy>) => void;
  toggleProvider: (id: string) => void;
  syncRoutes: () => void;
}

const nowLabel = () =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());

export const useAdminStore = create<AdminState>((set) => ({
  models: platformModels.map((model) => ({ ...model })),
  policies: routePolicies.map((policy) => ({ ...policy })),
  selectedPolicyId: "policy-brand-film",
  selectedProviderId: "runway",
  lastSyncedAt: nowLabel(),
  selectPolicy: (selectedPolicyId) => set({ selectedPolicyId }),
  selectProvider: (selectedProviderId) => set({ selectedProviderId }),
  togglePolicy: (id) =>
    set((state) => ({
      policies: state.policies.map((policy) =>
        policy.id === id ? { ...policy, enabled: !policy.enabled } : policy
      )
    })),
  updatePolicy: (id, patch) =>
    set((state) => ({
      policies: state.policies.map((policy) =>
        policy.id === id ? { ...policy, ...patch } : policy
      )
    })),
  toggleProvider: (id) =>
    set((state) => ({
      models: state.models.map((model) =>
        model.id === id ? { ...model, enabled: !model.enabled } : model
      )
    })),
  syncRoutes: () => set({ lastSyncedAt: nowLabel() })
}));
