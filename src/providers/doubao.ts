/**
 * 豆包（火山引擎 ARK）模型提供商
 * 字节跳动旗下大模型平台
 */

import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { ProviderConfig, ModelDefinition } from "../types/index.js";

const DOUBAO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

/** 豆包模型定义 */
const DOUBAO_MODELS: ModelDefinition[] = [
  // ========== Doubao 1.5 Pro 系列 ==========
  {
    id: "doubao-1.5-pro-4k",
    name: "豆包 1.5 Pro 4K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 4096,
    maxTokens: 4096,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.4,   // ¥0.0004/千 token
      output: 1.26, // ¥0.00126/千 token
    },
  },
  {
    id: "doubao-1.5-pro-32k",
    name: "豆包 1.5 Pro 32K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 32768,
    maxTokens: 16384,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.8,   // ¥0.0008/千 token
      output: 2.0,  // ¥0.002/千 token
    },
  },
  {
    id: "doubao-1.5-pro-128k",
    name: "豆包 1.5 Pro 128K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 131072,
    maxTokens: 16384,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 2.0,   // ¥0.002/千 token
      output: 5.0,  // ¥0.005/千 token
    },
  },
  {
    id: "doubao-1.5-pro-256k",
    name: "豆包 1.5 Pro 256K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 262144,
    maxTokens: 16384,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 5.0,   // ¥0.005/千 token
      output: 9.0,  // ¥0.009/千 token
    },
  },

  // ========== Doubao 1.5 Lite 系列 ==========
  {
    id: "doubao-1.5-lite-4k",
    name: "豆包 1.5 Lite 4K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 4096,
    maxTokens: 4096,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.15,  // ¥0.00015/千 token
      output: 0.3,  // ¥0.0003/千 token
    },
  },
  {
    id: "doubao-1.5-lite-32k",
    name: "豆包 1.5 Lite 32K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 32768,
    maxTokens: 16384,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.3,   // ¥0.0003/千 token
      output: 0.6,  // ¥0.0006/千 token
    },
  },
  {
    id: "doubao-1.5-lite-128k",
    name: "豆包 1.5 Lite 128K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 131072,
    maxTokens: 16384,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.8,   // ¥0.0008/千 token
      output: 1.0,  // ¥0.001/千 token
    },
  },

  // ========== Doubao 1.5 Vision 系列 ==========
  {
    id: "doubao-1.5-vision-pro-32k",
    name: "豆包 1.5 Vision Pro 32K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 32768,
    maxTokens: 16384,
    supportsVision: true,
    supportsReasoning: false,
    cost: {
      input: 3.0,   // ¥0.003/千 token
      output: 9.0,  // ¥0.009/千 token
    },
  },

  // ========== Doubao Pro 系列（经典版）==========
  {
    id: "doubao-pro-4k",
    name: "豆包 Pro 4K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 4096,
    maxTokens: 4096,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.4,
      output: 1.26,
    },
  },
  {
    id: "doubao-pro-32k",
    name: "豆包 Pro 32K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 32768,
    maxTokens: 4096,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.8,
      output: 2.0,
    },
  },
  {
    id: "doubao-pro-128k",
    name: "豆包 Pro 128K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 131072,
    maxTokens: 4096,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 5.0,
      output: 9.0,
    },
  },
  {
    id: "doubao-pro-256k",
    name: "豆包 Pro 256K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 262144,
    maxTokens: 4096,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 5.0,
      output: 9.0,
    },
  },

  // ========== Doubao Lite 系列（经典版）==========
  {
    id: "doubao-lite-4k",
    name: "豆包 Lite 4K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 4096,
    maxTokens: 4096,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.15,
      output: 0.3,
    },
  },
  {
    id: "doubao-lite-32k",
    name: "豆包 Lite 32K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 32768,
    maxTokens: 4096,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.3,
      output: 0.6,
    },
  },
  {
    id: "doubao-lite-128k",
    name: "豆包 Lite 128K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 131072,
    maxTokens: 4096,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.8,
      output: 1.0,
    },
  },

  // ========== Doubao Vision 系列（经典版）==========
  {
    id: "doubao-vision-pro-32k",
    name: "豆包 Vision Pro 32K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 32768,
    maxTokens: 4096,
    supportsVision: true,
    supportsReasoning: false,
    cost: {
      input: 3.0,
      output: 9.0,
    },
  },
  {
    id: "doubao-vision-lite-32k",
    name: "豆包 Vision Lite 32K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 32768,
    maxTokens: 4096,
    supportsVision: true,
    supportsReasoning: false,
    cost: {
      input: 1.0,
      output: 3.0,
    },
  },

  // ========== Doubao Character 角色扮演系列 ==========
  {
    id: "doubao-character-pro-32k",
    name: "豆包角色扮演 Pro 32K",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 32768,
    maxTokens: 4096,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 2.0,
      output: 4.0,
    },
  },

  // ========== Doubao Embedding 向量模型 ==========
  {
    id: "doubao-embedding",
    name: "豆包 Embedding",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 4096,
    maxTokens: 0,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.5,
      output: 0,
    },
  },
  {
    id: "doubao-embedding-large",
    name: "豆包 Embedding Large",
    provider: "doubao",
    api: "openai-compatible",
    contextWindow: 4096,
    maxTokens: 0,
    supportsVision: false,
    supportsReasoning: false,
    cost: {
      input: 0.7,
      output: 0,
    },
  },
];

export class DoubaoProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, customBaseUrl?: string) {
    const config: ProviderConfig = {
      id: "doubao",
      name: "豆包",
      baseUrl: customBaseUrl || DOUBAO_BASE_URL,
      apiKey,
      api: "openai-compatible",
      models: DOUBAO_MODELS,
    };
    super(config);
    this.logger = this.logger.child({ provider: "doubao" });
  }

  /** 豆包使用推理接入点 ID 作为 model 参数，支持动态模型 */
  override supportsModel(modelId: string): boolean {
    // 支持预定义模型
    if (super.supportsModel(modelId)) {
      return true;
    }
    // 支持以 ep- 开头的推理接入点 ID（火山引擎 Endpoint ID 格式）
    if (modelId.startsWith("ep-")) {
      return true;
    }
    return false;
  }
}

/** 创建豆包提供商 */
export function createDoubaoProvider(apiKey: string, baseUrl?: string): DoubaoProvider {
  return new DoubaoProvider(apiKey, baseUrl);
}
