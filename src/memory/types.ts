/**
 * Memory Types - Core type definitions for the memory system
 */

// ============== Core Memory Types ==============

/** Memory entry - core data structure */
export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    type: "conversation" | "fact" | "note" | "code";
    source?: string;
    timestamp: number;
    tags?: string[];
  };
  score?: number;
}

/** Memory store interface - abstract storage layer */
export interface MemoryStore {
  add(entry: Omit<MemoryEntry, "id">): Promise<string>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  get(id: string): Promise<MemoryEntry | undefined>;
  delete(id: string): Promise<boolean>;
  list(filter?: MemoryListFilter): Promise<MemoryEntry[]>;
  clear(): Promise<void>;
  close?(): Promise<void>;
  status?(): MemoryStoreStatus;
}

/** List filter for memory entries */
export interface MemoryListFilter {
  type?: string;
  tags?: string[];
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

/** Store-specific status information */
export interface MemoryStoreStatus {
  entries: number;
  size?: number;
  backend: "sqlite" | "json";
  [key: string]: unknown;
}

// ============== Embedding Types ==============

/** Embedding provider interface */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  dimension: number;
  id: string;
  model?: string;
  close?(): Promise<void>;
}

/** Embedding provider result */
export interface EmbeddingProviderResult {
  provider: EmbeddingProvider;
  requestedProvider: string;
  fallbackFrom?: string;
  fallbackReason?: string;
}

// ============== Search Types ==============

/** Memory source type */
export type MemorySource = "memory" | "sessions";

/** Search result structure */
export interface MemorySearchResult {
  id: string;
  path?: string;
  content: string;
  score: number;
  source: MemorySource;
  snippet?: string;
  startLine?: number;
  endLine?: number;
  metadata?: Partial<MemoryEntry["metadata"]>;
}

/** Search options */
export interface MemorySearchOptions {
  maxResults?: number;
  minScore?: number;
  source?: MemorySource;
  sessionKey?: string;
}

/** Hybrid search weights */
export interface HybridSearchConfig {
  enabled: boolean;
  vectorWeight: number;
  textWeight: number;
  candidateMultiplier: number;
}

// ============== Provider Status Types ==============

/** Embedding availability probe result */
export interface MemoryEmbeddingProbeResult {
  ok: boolean;
  error?: string;
}

/** Sync progress update */
export interface MemorySyncProgressUpdate {
  completed: number;
  total: number;
  label?: string;
}

/** Complete provider status */
export interface MemoryProviderStatus {
  backend: "sqlite" | "json";
  provider: string;
  model?: string;
  requestedProvider?: string;
  entries?: number;
  chunks?: number;
  dirty?: boolean;
  storePath?: string;
  sources?: MemorySource[];
  cache?: {
    enabled: boolean;
    entries?: number;
    maxEntries?: number;
  };
  vector?: {
    enabled: boolean;
    available?: boolean;
    dims?: number;
  };
  fts?: {
    enabled: boolean;
    available: boolean;
    error?: string;
  };
  fallback?: {
    from: string;
    reason?: string;
  };
  custom?: Record<string, unknown>;
}

// ============== Configuration Types ==============

/** Memory configuration */
export interface MemoryConfig {
  enabled?: boolean;
  directory?: string;
  /** Data sources to index */
  sources?: MemorySource[];
  /** Embedding provider settings */
  embedding?: {
    provider?: string;
    model?: string;
    local?: {
      modelPath?: string;
      modelCacheDir?: string;
    };
    remote?: {
      baseUrl?: string;
      apiKey?: string;
      headers?: Record<string, string>;
    };
  };
  /** Storage backend settings */
  store?: {
    driver: "sqlite" | "json";
    path?: string;
    vector?: {
      enabled: boolean;
    };
  };
  /** Chunking settings */
  chunking?: {
    tokens?: number;
    overlap?: number;
  };
  /** Search settings */
  search?: {
    maxResults?: number;
    minScore?: number;
    hybrid?: HybridSearchConfig;
  };
  /** Sync settings */
  sync?: {
    onSessionStart?: boolean;
    onSearch?: boolean;
    watch?: boolean;
    watchDebounceMs?: number;
    intervalMinutes?: number;
  };
  /** Cache settings */
  cache?: {
    enabled?: boolean;
    maxEntries?: number;
  };
  /** Fallback provider */
  fallback?: string;
  /** Additional memory paths */
  extraPaths?: string[];
}

/** Memory manager configuration */
export interface MemoryManagerConfig extends Partial<MemoryConfig> {
  enabled?: boolean;
  directory?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
  provider?: unknown; // BaseProvider instance
}
