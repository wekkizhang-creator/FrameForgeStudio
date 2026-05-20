"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  defaultVideoParameterSchemas,
  formatParameterSchema,
  parseParameterSchemaDraft
} from "@/lib/model-parameter-schema";
import type { ModelParameterSchema } from "@/lib/types";

interface ModelSchemaState {
  schemas: Record<string, ModelParameterSchema>;
  drafts: Record<string, string>;
  errors: Record<string, string | null>;
  selectedModelId: string;
  selectModelSchema: (modelId: string) => void;
  updateSchemaDraft: (modelId: string, draft: string) => void;
  resetSchema: (modelId: string) => void;
}

const initialSchemas = Object.fromEntries(
  Object.entries(defaultVideoParameterSchemas).map(([modelId, schema]) => [modelId, { ...schema }])
) as Record<string, ModelParameterSchema>;

const initialDrafts = Object.fromEntries(
  Object.entries(initialSchemas).map(([modelId, schema]) => [modelId, formatParameterSchema(schema)])
) as Record<string, string>;

const initialErrors = Object.fromEntries(
  Object.keys(initialSchemas).map((modelId) => [modelId, null])
) as Record<string, string | null>;

export const useModelSchemaStore = create<ModelSchemaState>()(
  persist(
    (set) => ({
      schemas: initialSchemas,
      drafts: initialDrafts,
      errors: initialErrors,
      selectedModelId: "seedance",
      selectModelSchema: (selectedModelId) => set({ selectedModelId }),
      updateSchemaDraft: (modelId, draft) =>
        set((state) => {
          const parsed = parseParameterSchemaDraft(draft);
          return {
            drafts: {
              ...state.drafts,
              [modelId]: draft
            },
            errors: {
              ...state.errors,
              [modelId]: parsed.error
            },
            schemas: parsed.schema
              ? {
                  ...state.schemas,
                  [modelId]: parsed.schema
                }
              : state.schemas
          };
        }),
      resetSchema: (modelId) =>
        set((state) => {
          const schema = defaultVideoParameterSchemas[modelId] ?? defaultVideoParameterSchemas.seedance;
          return {
            schemas: {
              ...state.schemas,
              [modelId]: schema
            },
            drafts: {
              ...state.drafts,
              [modelId]: formatParameterSchema(schema)
            },
            errors: {
              ...state.errors,
              [modelId]: null
            }
          };
        })
    }),
    {
      name: "frameforge-model-parameter-schemas",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        schemas: state.schemas,
        drafts: state.drafts,
        errors: state.errors,
        selectedModelId: state.selectedModelId
      })
    }
  )
);
