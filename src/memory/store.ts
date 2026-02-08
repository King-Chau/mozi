/**
 * Memory Store Implementations
 * SQLite and JSON storage backends for memory entries
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getChildLogger } from "../utils/logger.js";
import type {
  MemoryEntry,
  MemoryStore,
  MemoryListFilter,
  MemoryStoreStatus,
} from "./types.js";

const logger = getChildLogger("memory-store");

// ============== Utility Functions ==============

/** Generate unique ID */
export function generateMemoryId(): string {
  return crypto.randomBytes(8).toString("hex");
}

/** Hash text content */
export function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Cosine similarity for two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/** Chunk text into smaller pieces */
export function chunkText(
  content: string,
  options: { tokens?: number; overlap?: number } = {},
): Array<{ text: string; start: number; end: number }> {
  const tokens = options.tokens ?? 512;
  const overlap = options.overlap ?? 64;
  const maxChars = tokens * 4;
  const overlapChars = overlap * 4;

  const lines = content.split("\n");
  if (lines.length === 0) return [];

  const chunks: Array<{ text: string; start: number; end: number }> = [];
  let current: Array<{ line: string; lineNo: number }> = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length === 0) return;
    const firstEntry = current[0]!;
    const lastEntry = current[current.length - 1]!;
    const text = current.map((e) => e.line).join("\n");
    chunks.push({
      text,
      start: firstEntry.lineNo,
      end: lastEntry.lineNo,
    });
  };

  const carryOverlap = () => {
    if (overlapChars <= 0 || current.length === 0) {
      current = [];
      currentChars = 0;
      return;
    }
    let acc = 0;
    const kept: Array<{ line: string; lineNo: number }> = [];
    for (let i = current.length - 1; i >= 0; i--) {
      const entry = current[i]!;
      acc += entry.line.length + 1;
      kept.unshift(entry);
      if (acc >= overlapChars) break;
    }
    current = kept;
    currentChars = kept.reduce((sum, e) => sum + e.line.length + 1, 0);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;

    if (currentChars + line.length + 1 > maxChars && current.length > 0) {
      flush();
      carryOverlap();
    }

    current.push({ line, lineNo });
    currentChars += line.length + 1;
  }

  flush();
  return chunks;
}

// ============== Memory Chunk ==============

export interface MemoryChunk {
  id: string;
  entryId: string;
  text: string;
  startLine: number;
  endLine: number;
  hash: string;
  embedding?: number[];
}

// ============== Base Memory Store ==============

/**
 * Base class providing common functionality for memory stores
 */
export abstract class BaseMemoryStore implements MemoryStore {
  protected abstract doAdd(entry: Omit<MemoryEntry, "id">): Promise<string>;
  protected abstract doSearch(
    query: string,
    limit: number,
  ): Promise<Array<MemoryEntry & { score: number }>>;
  protected abstract doGet(id: string): Promise<MemoryEntry | undefined>;
  protected abstract doDelete(id: string): Promise<boolean>;
  protected abstract doList(filter?: MemoryListFilter): Promise<MemoryEntry[]>;
  protected abstract doClear(): Promise<void>;
  protected abstract doClose(): Promise<void>;
  protected abstract doStatus(): MemoryStoreStatus;

  async add(entry: Omit<MemoryEntry, "id">): Promise<string> {
    return this.doAdd(entry);
  }

  async search(query: string, limit = 10): Promise<MemoryEntry[]> {
    return this.doSearch(query, limit);
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    return this.doGet(id);
  }

  async delete(id: string): Promise<boolean> {
    return this.doDelete(id);
  }

  async list(filter?: MemoryListFilter): Promise<MemoryEntry[]> {
    return this.doList(filter);
  }

  async clear(): Promise<void> {
    return this.doClear();
  }

  async close(): Promise<void> {
    return this.doClose();
  }

  status(): MemoryStoreStatus {
    return this.doStatus();
  }
}

// ============== JSON Memory Store (Enhanced) ==============

/**
 * JSON file-based memory store with LRU-like behavior
 */
export class JsonMemoryStore extends BaseMemoryStore {
  private directory: string;
  private indexFile: string;
  private entries: Map<string, MemoryEntry>;
  private embeddingCache: Map<string, number[]>;
  private maxCacheEntries: number;
  private dirty = false;

  constructor(options: {
    directory?: string;
    maxCacheEntries?: number;
  } = {}) {
    super();
    this.directory = options.directory ?? path.join(os.homedir(), ".mozi", "memory");
    this.indexFile = path.join(this.directory, "index.json");
    this.maxCacheEntries = options.maxCacheEntries ?? 1000;
    // Always create fresh maps for test isolation
    this.entries = new Map();
    this.embeddingCache = new Map();
    this.ensureDirectory();
    this.loadIndex();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.directory)) {
      fs.mkdirSync(this.directory, { recursive: true });
    }
  }

  private loadIndex(): void {
    // Always start with clean in-memory state
    this.entries.clear();
    this.embeddingCache.clear();

    if (!fs.existsSync(this.indexFile)) {
      logger.debug({ path: this.indexFile }, "Memory index file not found, starting fresh");
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.indexFile, "utf-8"));
      const entries = data.entries ?? [];

      // Load entries
      for (const entry of entries) {
        this.entries.set(entry.id, entry);
      }

      // Load embedding cache if available
      if (data.embeddings && Array.isArray(data.embeddings)) {
        for (const item of data.embeddings) {
          if (item.hash && Array.isArray(item.embedding)) {
            this.embeddingCache.set(item.hash, item.embedding);
          }
        }
        this.pruneCache();
      }

      logger.debug({ count: this.entries.size }, "Memory index loaded");
    } catch (error) {
      logger.error({ error }, "Failed to load memory index");
    }
  }

  private saveIndex(): void {
    if (!this.dirty) return;

    try {
      // Serialize embedding cache
      const embeddings = Array.from(this.embeddingCache.entries()).map(([hash, embedding]) => ({
        hash,
        embedding,
      }));

      const data = {
        version: 2,
        entries: Array.from(this.entries.values()),
        embeddings,
      };

      fs.writeFileSync(this.indexFile, JSON.stringify(data, null, 2), "utf-8");
      this.dirty = false;
      logger.debug("Memory index saved");
    } catch (error) {
      logger.error({ error }, "Failed to save memory index");
    }
  }

  private pruneCache(): void {
    if (this.embeddingCache.size <= this.maxCacheEntries) return;

    const entries = Array.from(this.embeddingCache.entries());
    const toRemove = entries.slice(0, entries.length - this.maxCacheEntries);
    for (const [hash] of toRemove) {
      this.embeddingCache.delete(hash);
    }
    logger.debug({ removed: toRemove.length }, "Pruned embedding cache");
  }

  protected doAdd(entry: Omit<MemoryEntry, "id">): Promise<string> {
    return new Promise((resolve) => {
      const id = generateMemoryId();
      const fullEntry: MemoryEntry = {
        id,
        content: entry.content,
        embedding: entry.embedding,
        metadata: entry.metadata,
      };

      this.entries.set(id, fullEntry);
      this.dirty = true;
      this.saveIndex();

      logger.debug({ id, type: entry.metadata.type }, "Memory entry added");
      resolve(id);
    });
  }

  protected async doSearch(
    query: string,
    limit: number,
  ): Promise<Array<MemoryEntry & { score: number }>> {
    // Simple keyword matching for JSON store (embedding search requires vector store)
    const normalizedQuery = query.toLowerCase();
    const results: Array<MemoryEntry & { score: number }> = [];

    for (const entry of this.entries.values()) {
      const contentLower = entry.content.toLowerCase();
      const score = this.computeKeywordScore(normalizedQuery, contentLower);
      if (score > 0) {
        results.push({ ...entry, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private computeKeywordScore(query: string, content: string): number {
    // Support Chinese characters: use length > 1 to match 2-char Chinese words
    const queryWords = query.split(/\s+/).filter((w) => w.length > 1);
    if (queryWords.length === 0) return 1;

    let matches = 0;
    for (const word of queryWords) {
      if (content.includes(word)) matches++;
    }
    return matches / queryWords.length;
  }

  protected doGet(id: string): Promise<MemoryEntry | undefined> {
    return Promise.resolve(this.entries.get(id));
  }

  protected doDelete(id: string): Promise<boolean> {
    const existed = this.entries.has(id);
    this.entries.delete(id);
    if (existed) {
      this.dirty = true;
      this.saveIndex();
    }
    return Promise.resolve(existed);
  }

  protected doList(filter?: MemoryListFilter): Promise<MemoryEntry[]> {
    let entries = Array.from(this.entries.values());

    if (filter?.type) {
      entries = entries.filter((e) => e.metadata.type === filter.type);
    }

    if (filter?.tags && filter.tags.length > 0) {
      entries = entries.filter((e) =>
        filter.tags!.some((tag) => e.metadata.tags?.includes(tag)),
      );
    }

    if (filter?.since) {
      entries = entries.filter((e) => e.metadata.timestamp >= filter.since!);
    }

    if (filter?.until) {
      entries = entries.filter((e) => e.metadata.timestamp <= filter.until!);
    }

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? entries.length;

    return Promise.resolve(entries.slice(offset, offset + limit));
  }

  protected doClear(): Promise<void> {
    this.entries.clear();
    this.embeddingCache.clear();
    this.dirty = true;

    if (fs.existsSync(this.indexFile)) {
      fs.unlinkSync(this.indexFile);
    }

    return Promise.resolve();
  }

  protected doClose(): Promise<void> {
    this.saveIndex();
    return Promise.resolve();
  }

  protected doStatus(): MemoryStoreStatus {
    return {
      entries: this.entries.size,
      backend: "json",
      cacheSize: this.embeddingCache.size,
    };
  }

  /** Get entries count */
  get count(): number {
    return this.entries.size;
  }
}

// ============== SQLite Memory Store ==============

/**
 * SQLite-based memory store with vector search support
 * Uses sqlite-vec extension for efficient similarity search
 */
export class SqliteMemoryStore extends BaseMemoryStore {
  private dbPath: string;
  private db: unknown | null = null;
  private embeddingProvider: { embed(texts: string[]): Promise<number[][]> } | null = null;
  private vectorEnabled = false;
  private dimension = 0;
  private initialized = false;

  // Table names
  private readonly META_TABLE = "meta";
  private readonly ENTRIES_TABLE = "entries";
  private readonly CHUNKS_TABLE = "chunks";
  private readonly VECTOR_TABLE = "chunks_vec";
  private readonly FTS_TABLE = "chunks_fts";
  private readonly EMBEDDING_CACHE_TABLE = "embedding_cache";

  constructor(options: {
    path?: string;
    vectorEnabled?: boolean;
  } = {}) {
    super();
    this.dbPath = options.path ?? path.join(os.homedir(), ".mozi", "memory.db");
    this.vectorEnabled = options.vectorEnabled ?? true;
    this.initializeDatabase();
  }

  /** Set embedding provider (required for vector search) */
  setEmbeddingProvider(
    provider: { embed(texts: string[]): Promise<number[][]> },
    dimension: number,
  ): void {
    this.embeddingProvider = provider;
    this.dimension = dimension;
  }

  private initializeDatabase(): void {
    try {
      // Dynamic import for better tree-shaking
      const sqlite3 = require("sqlite3");
      const Database = (sqlite3 as { DatabaseSync?: unknown }).DatabaseSync
        ? sqlite3.DatabaseSync
        : (sqlite3 as { Database: unknown }).Database;

      if (!Database) {
        logger.warn("SQLite synchronous mode not available, using async");
        this.db = new (sqlite3 as { Database: new (path: string) => unknown }).Database(this.dbPath);
      } else {
        this.db = new (Database as new (path: string) => unknown)(this.dbPath);
      }

      this.createSchema();
      this.initialized = true;
      logger.info({ path: this.dbPath }, "SQLite memory store initialized");
    } catch (error) {
      logger.error({ error }, "Failed to initialize SQLite database");
      throw error;
    }
  }

  private createSchema(): void {
    if (!this.db) return;

    const db = this.db as {
      exec: (sql: string) => void;
      prepare: (sql: string) => {
        run: (...args: unknown[]) => void;
        get: (...args: unknown[]) => unknown;
        all: (...args: unknown[]) => unknown[];
      };
    };

    // Meta table for metadata
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.META_TABLE} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Entries table for memory entries
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.ENTRIES_TABLE} (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'note',
        source TEXT,
        tags TEXT,
        timestamp INTEGER NOT NULL,
        embedding TEXT
      )
    `);

    // Chunks table for chunked entries
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.CHUNKS_TABLE} (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        text TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        hash TEXT NOT NULL,
        embedding TEXT,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (entry_id) REFERENCES ${this.ENTRIES_TABLE}(id)
      )
    `);

    // Indexes
    db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON ${this.ENTRIES_TABLE}(timestamp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_type ON ${this.ENTRIES_TABLE}(type)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_entry ON ${this.CHUNKS_TABLE}(entry_id)`);

    // Vector table (sqlite-vec)
    if (this.vectorEnabled) {
      try {
        db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS ${this.VECTOR_TABLE} USING vec0(
            id TEXT PRIMARY KEY,
            embedding FLOAT[${this.dimension || 1536}]
          )
        `);
        logger.info("sqlite-vec extension loaded");
      } catch (error) {
        logger.warn({ error }, "sqlite-vec not available, falling back to text search");
        this.vectorEnabled = false;
      }
    }

    // FTS5 full-text search
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${this.FTS_TABLE} USING fts5(
          text,
          id UNINDEXED,
          entry_id UNINDEXED
        )
      `);
    } catch (error) {
      logger.debug({ error }, "FTS5 not available");
    }

    // Embedding cache table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.EMBEDDING_CACHE_TABLE} (
        hash TEXT PRIMARY KEY,
        embedding TEXT NOT NULL,
        dims INTEGER,
        updated_at INTEGER NOT NULL
      )
    `);

    // Save version
    this.saveMeta("version", "1");
  }

  private saveMeta(key: string, value: string): void {
    if (!this.db) return;
    const db = this.db as {
      prepare: (sql: string) => { run: (...args: unknown[]) => void };
    };
    db.prepare(`INSERT OR REPLACE INTO ${this.META_TABLE} (key, value) VALUES (?, ?)`).run(key, value);
  }

  private getMeta(key: string): string | null {
    if (!this.db) return null;
    const db = this.db as {
      prepare: (sql: string) => { get: (...args: unknown[]) => unknown };
    };
    const row = db.prepare(`SELECT value FROM ${this.META_TABLE} WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  protected doAdd(entry: Omit<MemoryEntry, "id">): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const id = generateMemoryId();
      const db = this.db as {
        prepare: (sql: string) => { run: (...args: unknown[]) => void };
      };

      // Insert entry
      db.prepare(
        `INSERT INTO ${this.ENTRIES_TABLE} (id, content, type, source, tags, timestamp, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        entry.content,
        entry.metadata.type,
        entry.metadata.source ?? null,
        JSON.stringify(entry.metadata.tags ?? []),
        entry.metadata.timestamp,
        entry.embedding ? JSON.stringify(entry.embedding) : null,
      );

      logger.debug({ id, type: entry.metadata.type }, "Memory entry added to SQLite");
      resolve(id);
    });
  }

  protected async doSearch(
    query: string,
    limit: number,
  ): Promise<Array<MemoryEntry & { score: number }>> {
    if (!this.db) {
      return [];
    }

    // If vector search is enabled and we have embeddings
    if (this.vectorEnabled && this.embeddingProvider) {
      return this.vectorSearch(query, limit);
    }

    // Fall back to FTS or basic LIKE search
    return this.ftsSearch(query, limit);
  }

  private async vectorSearch(
    query: string,
    limit: number,
  ): Promise<Array<MemoryEntry & { score: number }>> {
    if (!this.embeddingProvider) return [];

    try {
      const [queryEmbedding] = await this.embeddingProvider.embed([query]);

      // Search vector table
      const db = this.db as {
        prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] };
      };

      // Note: sqlite-vec syntax - adjust based on actual version
      const results = db.prepare(`
        SELECT
          c.id,
          c.entry_id,
          c.text,
          c.start_line,
          c.end_line,
          c.embedding,
          e.content,
          e.type,
          e.source,
          e.tags,
          e.timestamp
        FROM ${this.CHUNKS_TABLE} c
        JOIN ${this.ENTRIES_TABLE} e ON c.entry_id = e.id
        ORDER BY c.embedding <=> ?
        LIMIT ?
      `).all(JSON.stringify(queryEmbedding), limit * 2) as Array<{
        id: string;
        entry_id: string;
        text: string;
        start_line: number;
        end_line: number;
        embedding: string;
        content: string;
        type: string;
        source: string | null;
        tags: string;
        timestamp: number;
      }>;

      return results.map((row) => {
        let embedding: number[] = [];
        try {
          const embStr = row.embedding as string | undefined;
          if (embStr) {
            embedding = JSON.parse(embStr) as number[];
          }
        } catch {}

        const entry: MemoryEntry & { score: number } = {
          id: row.entry_id,
          content: row.content,
          embedding,
          metadata: {
            type: row.type as "conversation" | "fact" | "note" | "code",
            source: row.source ?? undefined,
            timestamp: row.timestamp,
            tags: JSON.parse(row.tags) as string[],
          },
          score: 0.9, // Placeholder - actual score from vector distance
        };

        return entry;
      });
    } catch (error) {
      logger.error({ error }, "Vector search failed, falling back");
      return this.ftsSearch(query, limit);
    }
  }

  private async ftsSearch(
    query: string,
    limit: number,
  ): Promise<Array<MemoryEntry & { score: number }>> {
    const db = this.db as {
      prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] };
    };

    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    const searchPattern = `%${tokens.join("%")}%`;

    const results = db.prepare(`
      SELECT
        e.id,
        e.content,
        e.type,
        e.source,
        e.tags,
        e.timestamp
      FROM ${this.ENTRIES_TABLE} e
      WHERE e.content LIKE ? OR e.content LIKE ?
      ORDER BY e.timestamp DESC
      LIMIT ?
    `).all(`%${query}%`, searchPattern, limit) as Array<{
      id: string;
      content: string;
      type: string;
      source: string | null;
      tags: string;
      timestamp: number;
    }>;

    return results.map((row) => ({
      id: row.id,
      content: row.content,
      metadata: {
        type: row.type as "conversation" | "fact" | "note" | "code",
        source: row.source ?? undefined,
        timestamp: row.timestamp,
        tags: JSON.parse(row.tags) as string[],
      },
      score: 0.5,
    }));
  }

  protected doGet(id: string): Promise<MemoryEntry | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const db = this.db as {
        prepare: (sql: string) => { get: (...args: unknown[]) => unknown };
      };

      const row = db.prepare(
        `SELECT id, content, type, source, tags, timestamp, embedding
         FROM ${this.ENTRIES_TABLE} WHERE id = ?`,
      ).get(id) as {
        id: string;
        content: string;
        type: string;
        source: string | null;
        tags: string;
        timestamp: number;
        embedding: string | null;
      } | undefined;

      if (!row) {
        resolve(undefined);
        return;
      }

      let embedding: number[] | undefined;
      if (row.embedding) {
        try {
          embedding = JSON.parse(row.embedding) as number[];
        } catch {}
      }

      resolve({
        id: row.id,
        content: row.content,
        embedding,
        metadata: {
          type: row.type as "conversation" | "fact" | "note" | "code",
          source: row.source ?? undefined,
          timestamp: row.timestamp,
          tags: JSON.parse(row.tags) as string[],
        },
      });
    });
  }

  protected doDelete(id: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const db = this.db as {
        prepare: (sql: string) => { run: (...args: unknown[]) => void };
      };

      // Delete chunks first
      db.prepare(`DELETE FROM ${this.CHUNKS_TABLE} WHERE entry_id = ?`).run(id);
      // Delete entry
      db.prepare(`DELETE FROM ${this.ENTRIES_TABLE} WHERE id = ?`).run(id);

      resolve(true);
    });
  }

  protected doList(filter?: MemoryListFilter): Promise<MemoryEntry[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const db = this.db as {
        prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] };
      };

      let sql = `SELECT id, content, type, source, tags, timestamp, embedding FROM ${this.ENTRIES_TABLE} WHERE 1=1`;
      const params: unknown[] = [];

      if (filter?.type) {
        sql += " AND type = ?";
        params.push(filter.type);
      }

      if (filter?.since) {
        sql += " AND timestamp >= ?";
        params.push(filter.since);
      }

      if (filter?.until) {
        sql += " AND timestamp <= ?";
        params.push(filter.until);
      }

      sql += " ORDER BY timestamp DESC";

      const offset = filter?.offset ?? 0;
      const limit = filter?.limit ?? 100;
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = db.prepare(sql).all(...params) as Array<{
        id: string;
        content: string;
        type: string;
        source: string | null;
        tags: string;
        timestamp: number;
        embedding: string | null;
      }>;

      const entries: MemoryEntry[] = rows.map((row) => {
        let embedding: number[] | undefined;
        if (row.embedding) {
          try {
            embedding = JSON.parse(row.embedding) as number[];
          } catch {}
        }

        return {
          id: row.id,
          content: row.content,
          embedding,
          metadata: {
            type: row.type as "conversation" | "fact" | "note" | "code",
            source: row.source ?? undefined,
            timestamp: row.timestamp,
            tags: JSON.parse(row.tags) as string[],
          },
        };
      });

      // Apply tag filter in-memory if needed
      if (filter?.tags && filter.tags.length > 0) {
        resolve(entries.filter((e) => filter.tags!.some((tag) => e.metadata.tags?.includes(tag))));
      } else {
        resolve(entries);
      }
    });
  }

  protected doClear(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const db = this.db as {
        prepare: (sql: string) => { run: (...args: unknown[]) => void };
        close: (cb?: () => void) => void;
      };

      db.prepare(`DELETE FROM ${this.CHUNKS_TABLE}`).run();
      db.prepare(`DELETE FROM ${this.ENTRIES_TABLE}`).run();
      db.prepare(`DELETE FROM ${this.EMBEDDING_CACHE_TABLE}`).run();
      db.prepare(`DELETE FROM ${this.FTS_TABLE}`).run();

      logger.info("SQLite memory store cleared");
      resolve();
    });
  }

  protected doClose(): Promise<void> {
    return new Promise((resolve) => {
      if (this.db) {
        const db = this.db as { close: (cb?: () => void) => void };
        db.close(() => {
          this.db = null;
          logger.info("SQLite memory store closed");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  protected doStatus(): MemoryStoreStatus {
    if (!this.db) {
      return { entries: 0, backend: "sqlite" };
    }

    const db = this.db as {
      prepare: (sql: string) => { get: (...args: unknown[]) => unknown };
    };

    const entriesCount = db.prepare(`SELECT COUNT(*) as c FROM ${this.ENTRIES_TABLE}`).get() as { c: number } | undefined;
    const chunksCount = db.prepare(`SELECT COUNT(*) as c FROM ${this.CHUNKS_TABLE}`).get() as { c: number } | undefined;

    return {
      entries: entriesCount?.c ?? 0,
      chunks: chunksCount?.c ?? 0,
      backend: "sqlite",
      vectorEnabled: this.vectorEnabled,
    };
  }

  /** Get entries count */
  get count(): number {
    if (!this.db) return 0;

    const db = this.db as {
      prepare: (sql: string) => { get: (...args: unknown[]) => unknown };
    };

    const result = db.prepare(`SELECT COUNT(*) as c FROM ${this.ENTRIES_TABLE}`).get() as { c: number } | undefined;
    return result?.c ?? 0;
  }
}
