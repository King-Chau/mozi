/**
 * Embedding Providers
 * Various embedding provider implementations for memory vectorization
 */

import { getChildLogger } from "../utils/logger.js";
import type { EmbeddingProvider } from "./types.js";
import { SimpleEmbedding } from "./embeddings/simple.js";

const logger = getChildLogger("embeddings");

// Re-export SimpleEmbedding
export { SimpleEmbedding };

// ============== Provider-based Embedding ==============

/**
 * Embedding provider that uses a BaseProvider instance
 */
export class ProviderEmbedding implements EmbeddingProvider {
  dimension: number;
  id: string;
  model?: string;
  private provider: {
    supportsEmbedding(): boolean;
    embed(texts: string[], model?: string): Promise<number[][]>;
  };
  private fallback: SimpleEmbedding;

  constructor(
    provider: {
      supportsEmbedding(): boolean;
      embed(texts: string[], model?: string): Promise<number[][]>;
    },
    model?: string,
  ) {
    this.provider = provider;
    this.model = model;
    this.dimension = 1536; // Default OpenAI dimension
    this.id = "provider";
    this.fallback = new SimpleEmbedding();
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.provider.supportsEmbedding()) {
      logger.debug("Provider does not support embedding, using fallback");
      return this.fallback.embed(texts);
    }

    try {
      const embeddings = await this.provider.embed(texts, this.model);
      if (embeddings.length > 0 && embeddings[0]) {
        this.dimension = embeddings[0].length;
      }
      return embeddings;
    } catch (error) {
      logger.warn({ error }, "Provider embedding failed, using fallback");
      return this.fallback.embed(texts);
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embed([text]);
    return embedding ?? [];
  }
}

// ============== API-based Embedding ==============

/**
 * Embedding provider that uses an external API directly
 */
export class APIEmbedding implements EmbeddingProvider {
  dimension: number;
  id: string;
  model: string;
  private options: {
    baseUrl?: string;
    apiKey?: string;
    headers?: Record<string, string>;
  };
  private fallback: SimpleEmbedding;

  constructor(options: {
    providerId?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    headers?: Record<string, string>;
  } = {}) {
    this.model = options.model ?? "text-embedding-ada-002";
    this.id = options.providerId ?? "api";
    this.dimension = 1536;
    this.options = {
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      headers: options.headers,
    };
    this.fallback = new SimpleEmbedding();
  }

  async embed(texts: string[]): Promise<number[][]> {
    const baseUrl = this.options.baseUrl ?? "https://api.openai.com/v1";
    const apiKey = this.options.apiKey;

    if (!apiKey) {
      logger.warn("API key not configured, using fallback");
      return this.fallback.embed(texts);
    }

    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...this.options.headers,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as { data: Array<{ embedding: number[] }> };

      if (data.data && data.data.length > 0) {
        this.dimension = data.data[0]!.embedding.length;
      }

      return data.data.map((item) => item.embedding);
    } catch (error) {
      logger.warn({ error }, "API embedding failed, using fallback");
      return this.fallback.embed(texts);
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embed([text]);
    return embedding ?? new Array(this.dimension).fill(0);
  }
}

// ============== Embedding Provider Factory ==============

export interface EmbeddingProviderOptions {
  provider?: "simple" | "provider" | "api" | string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  localModel?: {
    modelPath?: string;
    modelCacheDir?: string;
  };
  providerInstance?: {
    supportsEmbedding(): boolean;
    embed(texts: string[], model?: string): Promise<number[][]>;
  };
}

/**
 * Create an embedding provider based on configuration
 */
export function createEmbeddingProvider(options: EmbeddingProviderOptions): EmbeddingProvider {
  // If provider instance is provided, use it
  if (options.providerInstance) {
    return new ProviderEmbedding(options.providerInstance, options.model);
  }

  // Simple embedding for local/offline use
  if (options.provider === "simple") {
    return new SimpleEmbedding();
  }

  // API-based embedding (OpenAI compatible)
  if (options.provider === "api" || options.provider === "openai") {
    return new APIEmbedding({
      providerId: options.provider,
      model: options.model,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      headers: options.headers,
    });
  }

  // Default to simple embedding
  logger.info({ provider: options.provider }, "Unknown embedding provider, using simple");
  return new SimpleEmbedding();
}

// ============== Embedding Cache ==============

/**
 * Simple LRU cache for embeddings
 */
export class EmbeddingCache {
  private cache: Map<string, { embedding: number[]; timestamp: number }> = new Map();
  private maxEntries: number;
  private ttl: number;

  constructor(options: { maxEntries?: number; ttlMs?: number } = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
    this.ttl = options.ttlMs ?? 24 * 60 * 60 * 1000; // 24 hours default
  }

  get(hash: string): number[] | undefined {
    const entry = this.cache.get(hash);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(hash);
      return undefined;
    }

    return entry.embedding;
  }

  set(hash: string, embedding: number[]): void {
    // Check if cache is full
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(hash, {
      embedding,
      timestamp: Date.now(),
    });
  }

  private evictOldest(): void {
    const oldest = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, Math.floor(this.maxEntries * 0.1));

    for (const [hash] of oldest) {
      this.cache.delete(hash);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============== Embedding Batching ==============

/**
 * Batch multiple embedding requests together
 */
export class BatchEmbedding {
  private provider: EmbeddingProvider;
  private batchSize: number;
  private queue: Array<{
    texts: string[];
    resolve: (value: number[][]) => void;
    reject: (reason: Error) => void;
  }> = [];
  private processing = false;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: {
    provider: EmbeddingProvider;
    batchSize?: number;
    batchDelayMs?: number;
  }) {
    this.provider = options.provider;
    this.batchSize = options.batchSize ?? 32;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length <= this.batchSize) {
      return this.provider.embed(texts);
    }

    // Split into batches
    const batches: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const result = await this.provider.embed(batch);
      batches.push(...result);
    }
    return batches;
  }

  async embedWithRetry(
    texts: string[],
    maxRetries = 3,
    baseDelayMs = 1000,
  ): Promise<number[][]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.embed(texts);
      } catch (error) {
        lastError = error as Error;
        const delay = baseDelayMs * Math.pow(2, attempt);
        logger.warn({ attempt, delay, error }, "Embedding failed, retrying");
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
