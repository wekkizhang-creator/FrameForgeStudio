"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { CheckCircle2, FileCode2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import {
  buildVendorRequestPayload,
  getActiveOptionRuleReason,
  getDisabledEnumValues,
  getParameterSchemaFields,
  normalizeParameterValues,
  validateParameterValues
} from "@/lib/model-parameter-schema";
import type {
  ModelParameterPropertySchema,
  ModelParameterSchema,
  VideoGenerationConfig,
  VideoGenerationValue
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface SchemaParameterFormProps {
  modelId: string;
  schema: ModelParameterSchema;
  value: VideoGenerationConfig;
  prompt: string;
  onChange: (value: VideoGenerationConfig) => void;
}

export function SchemaParameterForm({
  modelId,
  schema,
  value,
  prompt,
  onChange
}: SchemaParameterFormProps) {
  const valueKey = JSON.stringify(value);
  const defaults = useMemo(
    () => normalizeParameterValues(schema, JSON.parse(valueKey) as VideoGenerationConfig),
    [schema, valueKey]
  );
  const defaultsKey = JSON.stringify(defaults);
  const form = useForm<VideoGenerationConfig>({
    defaultValues: defaults,
    mode: "onChange"
  });
  const watched = useWatch({ control: form.control }) as VideoGenerationConfig;
  const watchedKey = JSON.stringify(watched);
  const normalizedWatched = useMemo(
    () => normalizeParameterValues(schema, JSON.parse(watchedKey) as VideoGenerationConfig),
    [schema, watchedKey]
  );
  const normalizedWatchedKey = JSON.stringify(normalizedWatched);

  useEffect(() => {
    form.reset(defaults);
  }, [defaults, defaultsKey, form]);

  useEffect(() => {
    if (normalizedWatchedKey !== watchedKey) {
      form.reset(normalizedWatched);
      if (normalizedWatchedKey !== valueKey) {
        onChange(normalizedWatched);
      }
      return;
    }
    if (normalizedWatchedKey !== valueKey) {
      onChange(normalizedWatched);
    }
  }, [form, normalizedWatched, normalizedWatchedKey, onChange, valueKey, watchedKey]);

  const validation = validateParameterValues(schema, normalizedWatched);
  const requestPayload = buildVendorRequestPayload(modelId, schema, prompt, normalizedWatched);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{schema.title}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{schema.description}</div>
          </div>
          <Badge tone={validation.valid ? "green" : "red"}>
            {validation.valid ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <FileCode2 className="h-3 w-3" />
            )}
            草案校验
          </Badge>
        </div>
      </div>

      <div className="grid gap-3">
        {getParameterSchemaFields(schema).map(([fieldKey, property]) => (
          <SchemaField
            key={`${schema.$id}-${fieldKey}`}
            fieldKey={fieldKey}
            property={property}
            values={watched}
            control={form.control}
            setValue={(nextValue) =>
              form.setValue(fieldKey, nextValue, {
                shouldDirty: true,
                shouldValidate: true
              })
            }
          />
        ))}
      </div>

      {!validation.valid && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
          {validation.errors.join("；")}
        </div>
      )}

      <div className="rounded-lg border border-border bg-foreground p-3 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/60">
            厂商接口请求体
          </div>
          <Badge tone="neutral">{requestPayload.endpoint}</Badge>
        </div>
        <pre className="mt-3 max-h-56 overflow-auto text-xs leading-5 text-white/86">
          {JSON.stringify(requestPayload.body, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function SchemaField({
  fieldKey,
  property,
  values,
  control,
  setValue
}: {
  fieldKey: string;
  property: ModelParameterPropertySchema;
  values: VideoGenerationConfig;
  control: ReturnType<typeof useForm<VideoGenerationConfig>>["control"];
  setValue: (value: VideoGenerationValue) => void;
}) {
  const disabledOptions = getDisabledEnumValues(property, values);
  const ruleReason = getActiveOptionRuleReason(property, values);
  const widget = property["ui:widget"] ?? (property.enum ? "select" : "text");

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="normal-case tracking-normal">{property.title}</Label>
        {property["ui:apiField"] && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {fieldKey} → {property["ui:apiField"]}
          </span>
        )}
      </div>

      <Controller
        name={fieldKey}
        control={control}
        render={({ field }) => {
          if (widget === "switch" || property.type === "boolean") {
            return (
              <button
                type="button"
                onClick={() => field.onChange(!field.value)}
                className={cn(
                  "mt-2 flex h-9 w-full items-center justify-between rounded-md border px-3 text-sm transition",
                  field.value
                    ? "border-primary bg-primary/[0.08] text-primary"
                    : "border-border bg-surface text-muted-foreground"
                )}
              >
                <span>{field.value ? "已开启" : "已关闭"}</span>
                <span
                  className={cn(
                    "h-5 w-9 rounded-full p-0.5 transition",
                    field.value ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                >
                  <span
                    className={cn(
                      "block h-4 w-4 rounded-full bg-white transition",
                      field.value && "translate-x-4"
                    )}
                  />
                </span>
              </button>
            );
          }

          if (widget === "slider") {
            const min = property.minimum ?? 0;
            const max = property.maximum ?? 1;
            const step = property.multipleOf ?? 0.01;
            return (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={Number(field.value ?? property.default ?? min)}
                    onChange={(event) => field.onChange(Number(event.target.value))}
                    className="w-full accent-teal-700"
                  />
                  <span className="w-12 text-right text-xs font-semibold">
                    {Number(field.value ?? 0).toFixed(step < 1 ? 2 : 0)}
                  </span>
                </div>
              </div>
            );
          }

          if (widget === "upload") {
            return (
              <div className="mt-2 flex gap-2">
                <Input
                  value={String(field.value ?? "")}
                  onChange={(event) => field.onChange(event.target.value)}
                  placeholder="未上传"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setValue(`mock://${fieldKey}-${Date.now()}.png`)}
                >
                  <Upload className="h-3.5 w-3.5" />
                  上传
                </Button>
              </div>
            );
          }

          if (widget === "textarea") {
            return (
              <Textarea
                className="mt-2 min-h-20"
                value={String(field.value ?? "")}
                onChange={(event) => field.onChange(event.target.value)}
                placeholder={property["ui:placeholder"]}
              />
            );
          }

          if (property.enum && widget === "radio") {
            return (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {property.enum.map((option) => {
                  const disabled = disabledOptions.has(String(option));
                  return (
                    <button
                      key={String(option)}
                      type="button"
                      disabled={disabled}
                      onClick={() => field.onChange(option)}
                      className={cn(
                        "h-9 rounded-md border px-3 text-sm font-medium transition",
                        String(field.value) === String(option)
                          ? "border-primary bg-primary/[0.09] text-primary"
                          : "border-border bg-surface text-muted-foreground hover:border-primary/50",
                        disabled && "cursor-not-allowed opacity-40 hover:border-border"
                      )}
                    >
                      {String(option)}
                    </button>
                  );
                })}
              </div>
            );
          }

          if (property.enum) {
            return (
              <Select
                className="mt-2"
                value={String(field.value ?? "")}
                onChange={(event) => field.onChange(event.target.value)}
              >
                {property.enum.map((option) => (
                  <option key={String(option)} value={String(option)} disabled={disabledOptions.has(String(option))}>
                    {String(option)}
                  </option>
                ))}
              </Select>
            );
          }

          return (
            <Input
              className="mt-2"
              type={property.type === "number" || property.type === "integer" ? "number" : "text"}
              value={String(field.value ?? "")}
              onChange={(event) =>
                field.onChange(
                  property.type === "number" || property.type === "integer"
                    ? Number(event.target.value)
                    : event.target.value
                )
              }
              placeholder={property["ui:placeholder"]}
            />
          );
        }}
      />

      {property.description && (
        <div className="mt-2 text-xs leading-5 text-muted-foreground">{property.description}</div>
      )}
      {ruleReason && <div className="mt-2 text-xs leading-5 text-amber-700">{ruleReason}</div>}
    </div>
  );
}
