import Ajv from "ajv";
import type {
  ModelParameterPropertySchema,
  ModelParameterSchema,
  VideoGenerationConfig,
  VideoGenerationValue
} from "@/lib/types";

export const defaultVideoParameterSchemas: Record<string, ModelParameterSchema> = {
  seedance: {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "schema.video.seedance.v1",
    title: "Seedance 参数结构",
    description: "字节 Seedance 写实与运镜增强模型",
    type: "object",
    required: ["resolution", "duration", "camera_motion"],
    "ui:order": [
      "resolution",
      "duration",
      "camera_motion",
      "seed",
      "first_frame_image",
      "style_reference_image"
    ],
    "ui:api": {
      method: "POST",
      endpoint: "/seedance/v1/videos/generations",
      promptField: "prompt"
    },
    properties: {
      resolution: {
        type: "string",
        title: "分辨率",
        enum: ["720P", "1080P"],
        default: "1080P",
        "ui:widget": "select",
        "ui:apiField": "resolution"
      },
      duration: {
        type: "string",
        title: "时长",
        enum: ["5s", "10s"],
        default: "5s",
        "ui:widget": "radio",
        "ui:apiField": "duration",
        "ui:apiTransform": "seconds",
        "ui:unit": "sec",
        "ui:optionRules": [
          {
            when: { field: "resolution", equals: "1080P" },
            disable: ["10s"],
            reason: "Seedance 当前 1080P 仅开放 5s 生成"
          }
        ]
      },
      camera_motion: {
        type: "string",
        title: "运镜",
        enum: ["push-in", "pan", "static", "orbit"],
        default: "push-in",
        "ui:widget": "select",
        "ui:apiField": "camera_motion"
      },
      seed: {
        type: "integer",
        title: "随机种子",
        default: 8234,
        minimum: 0,
        maximum: 99999,
        "ui:widget": "text",
        "ui:apiField": "seed",
        "ui:apiTransform": "number"
      },
      first_frame_image: {
        type: "string",
        title: "首帧图",
        default: "",
        "ui:widget": "upload",
        "ui:apiField": "first_frame_image_url"
      },
      style_reference_image: {
        type: "string",
        title: "风格参考图",
        default: "",
        "ui:widget": "upload",
        "ui:apiField": "style_reference_image_url"
      }
    }
  },
  hailuo: {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "schema.video.hailuo.v1",
    title: "Hailuo 参数结构",
    description: "海螺人物、情绪与口播强化模型",
    type: "object",
    required: ["resolution", "duration", "prompt_optimizer"],
    "ui:order": [
      "resolution",
      "duration",
      "prompt_optimizer",
      "emotional_intensity",
      "first_frame_image"
    ],
    "ui:api": {
      method: "POST",
      endpoint: "/hailuo/v2/video/create",
      promptField: "text_prompt"
    },
    properties: {
      resolution: {
        type: "string",
        title: "分辨率",
        enum: ["720P", "1080P"],
        default: "1080P",
        "ui:widget": "select",
        "ui:apiField": "video_size"
      },
      duration: {
        type: "string",
        title: "时长",
        enum: ["5s", "10s"],
        default: "5s",
        "ui:widget": "radio",
        "ui:apiField": "duration",
        "ui:apiTransform": "seconds",
        "ui:optionRules": [
          {
            when: { field: "resolution", equals: "1080P" },
            disable: ["10s"],
            reason: "海螺 1080P 队列只支持短时长任务"
          }
        ]
      },
      prompt_optimizer: {
        type: "boolean",
        title: "提示词优化器",
        default: true,
        "ui:widget": "switch",
        "ui:apiField": "prompt_optimizer",
        "ui:apiTransform": "boolean"
      },
      emotional_intensity: {
        type: "number",
        title: "情绪强度",
        default: 0.62,
        minimum: 0,
        maximum: 1,
        multipleOf: 0.01,
        "ui:widget": "slider",
        "ui:apiField": "emotion_strength",
        "ui:apiTransform": "number"
      },
      first_frame_image: {
        type: "string",
        title: "首帧图",
        default: "",
        "ui:widget": "upload",
        "ui:apiField": "first_frame"
      }
    }
  },
  kling: {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "schema.video.kling.v1",
    title: "Kling 参数结构",
    description: "可灵长时长与复杂运动模型",
    type: "object",
    required: ["resolution", "duration", "cfg_scale", "camera_control"],
    "ui:order": [
      "resolution",
      "duration",
      "cfg_scale",
      "camera_control",
      "negative_prompt",
      "style_reference_image"
    ],
    "ui:api": {
      method: "POST",
      endpoint: "/kling/v1/videos",
      promptField: "prompt"
    },
    properties: {
      resolution: {
        type: "string",
        title: "分辨率",
        enum: ["720P", "1080P"],
        default: "720P",
        "ui:widget": "select",
        "ui:apiField": "size"
      },
      duration: {
        type: "string",
        title: "时长",
        enum: ["5s", "10s"],
        default: "10s",
        "ui:widget": "radio",
        "ui:apiField": "duration",
        "ui:apiTransform": "seconds"
      },
      cfg_scale: {
        type: "number",
        title: "提示遵循强度",
        default: 0.65,
        minimum: 0,
        maximum: 1,
        multipleOf: 0.01,
        "ui:widget": "slider",
        "ui:apiField": "cfg_scale",
        "ui:apiTransform": "number"
      },
      camera_control: {
        type: "string",
        title: "运镜",
        enum: ["push-in", "pan", "static", "orbit"],
        default: "orbit",
        "ui:widget": "select",
        "ui:apiField": "camera"
      },
      negative_prompt: {
        type: "string",
        title: "负向提示词",
        default: "低质量、模糊、手部畸变",
        "ui:widget": "textarea",
        "ui:apiField": "negative_prompt"
      },
      style_reference_image: {
        type: "string",
        title: "风格参考图",
        default: "",
        "ui:widget": "upload",
        "ui:apiField": "reference_image"
      }
    }
  }
};

const ajv = new Ajv({ allErrors: true, useDefaults: false });

export function getParameterSchemaFields(schema: ModelParameterSchema) {
  const ordered = schema["ui:order"] ?? [];
  const remaining = Object.keys(schema.properties).filter((key) => !ordered.includes(key));
  return [...ordered, ...remaining]
    .map((key) => [key, schema.properties[key]] as const)
    .filter((entry): entry is readonly [string, ModelParameterPropertySchema] => Boolean(entry[1]));
}

export function getDefaultParameterValues(schema: ModelParameterSchema): VideoGenerationConfig {
  return Object.fromEntries(
    getParameterSchemaFields(schema).map(([key, property]) => [
      key,
      property.default ?? property.enum?.[0] ?? defaultValueForType(property.type)
    ])
  );
}

export function normalizeParameterValues(
  schema: ModelParameterSchema,
  values: VideoGenerationConfig
): VideoGenerationConfig {
  const defaults = getDefaultParameterValues(schema);
  const next: VideoGenerationConfig = { ...defaults };

  getParameterSchemaFields(schema).forEach(([key, property]) => {
    const value = values[key] ?? defaults[key];
    next[key] = coerceValue(value, property);
  });

  getParameterSchemaFields(schema).forEach(([key, property]) => {
    if (!property.enum?.length) {
      return;
    }

    const disabled = getDisabledEnumValues(property, next);
    if (disabled.has(String(next[key]))) {
      next[key] = property.enum.find((option) => !disabled.has(String(option))) ?? property.enum[0];
    }
  });

  return next;
}

export function getDisabledEnumValues(
  property: ModelParameterPropertySchema,
  values: VideoGenerationConfig
) {
  const disabled = new Set<string>();

  property["ui:optionRules"]?.forEach((rule) => {
    if (values[rule.when.field] === rule.when.equals) {
      rule.disable.forEach((item) => disabled.add(String(item)));
    }
  });

  return disabled;
}

export function getActiveOptionRuleReason(
  property: ModelParameterPropertySchema,
  values: VideoGenerationConfig
) {
  return property["ui:optionRules"]?.find((rule) => values[rule.when.field] === rule.when.equals)
    ?.reason;
}

export function validateParameterValues(schema: ModelParameterSchema, values: VideoGenerationConfig) {
  const validate = ajv.compile(schema);
  const valid = validate(values);
  return {
    valid: Boolean(valid),
    errors:
      validate.errors?.map((error) => {
        const path = error.dataPath || "root";
        return `${path} ${error.message ?? "is invalid"}`;
      }) ?? []
  };
}

export function parseParameterSchemaDraft(draft: string) {
  try {
    const schema = JSON.parse(draft) as ModelParameterSchema;
    if (schema.type !== "object" || !schema.properties || typeof schema.properties !== "object") {
      return { schema: null, error: "参数结构必须是对象，并包含 properties" };
    }
    if (!schema["ui:api"]?.endpoint || !schema["ui:api"]?.promptField) {
      return { schema: null, error: "参数结构需要配置 ui:api.endpoint 与 ui:api.promptField" };
    }
    ajv.compile(schema);
    return { schema, error: null };
  } catch (error) {
    return {
      schema: null,
      error: error instanceof Error ? error.message : "JSON 参数结构解析失败"
    };
  }
}

export function formatParameterSchema(schema: ModelParameterSchema) {
  return JSON.stringify(schema, null, 2);
}

export function buildVendorRequestPayload(
  modelId: string,
  schema: ModelParameterSchema,
  prompt: string,
  values: VideoGenerationConfig
) {
  const normalized = normalizeParameterValues(schema, values);
  const api = schema["ui:api"] ?? {
    method: "POST" as const,
    endpoint: `/providers/${modelId}/generate`,
    promptField: "prompt"
  };
  const body: Record<string, unknown> = {
    [api.promptField]: prompt
  };

  getParameterSchemaFields(schema).forEach(([key, property]) => {
    const value = normalized[key];
    if (value === undefined || value === null || value === "") {
      return;
    }
    body[property["ui:apiField"] ?? key] = transformValue(value, property);
  });

  return {
    provider: modelId,
    method: api.method,
    endpoint: api.endpoint,
    body
  };
}

export function getDurationSecondsFromConfig(values: VideoGenerationConfig) {
  const duration = values.duration;
  if (typeof duration === "number") {
    return duration;
  }
  if (typeof duration === "string") {
    const parsed = Number.parseInt(duration, 10);
    return Number.isFinite(parsed) ? parsed : 5;
  }
  return 5;
}

function defaultValueForType(type: ModelParameterPropertySchema["type"]): VideoGenerationValue {
  if (type === "boolean") {
    return false;
  }
  if (type === "number" || type === "integer") {
    return 0;
  }
  return "";
}

function coerceValue(
  value: VideoGenerationValue,
  property: ModelParameterPropertySchema
): VideoGenerationValue {
  if (property.type === "boolean") {
    return value === true || value === "true";
  }

  if (property.type === "number" || property.type === "integer") {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return property.default ?? 0;
    }
    return property.type === "integer" ? Math.round(parsed) : parsed;
  }

  if (property.enum?.length && !property.enum.map(String).includes(String(value))) {
    return property.default ?? property.enum[0];
  }

  return value ?? property.default ?? "";
}

function transformValue(value: VideoGenerationValue, property: ModelParameterPropertySchema) {
  if (property["ui:apiTransform"] === "seconds" && typeof value === "string") {
    return Number.parseInt(value, 10);
  }
  if (property["ui:apiTransform"] === "number") {
    return Number(value);
  }
  if (property["ui:apiTransform"] === "boolean") {
    return Boolean(value);
  }
  if (property["ui:apiTransform"] === "string") {
    return String(value);
  }
  return value;
}
