/**
 * Hybrid Search Module
 * Combines vector search and full-text search results
 */

/**
 * Build FTS5 query from raw query text
 * Supports both English and Chinese characters
 */
export function buildFtsQuery(raw: string): string | null {
  // Match words including Chinese characters (CJK), English, numbers, underscore
  const tokens =
    raw
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map((t) => t.trim())
      .filter(Boolean) ?? [];

  if (tokens.length === 0) {
    return null;
  }

  const quoted = tokens.map((t) => `"${t.replaceAll('"', "")}"`);
  return quoted.join(" AND ");
}

/**
 * Convert BM25 rank to a normalized score (0-1)
 */
export function bm25RankToScore(rank: number): number {
  const normalized = Number.isFinite(rank) ? Math.max(0, rank) : 999;
  return 1 / (1 + normalized);
}

/**
 * Hybrid search result types
 */
export type HybridVectorResult = {
  id: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  source: string;
  snippet?: string;
  vectorScore: number;
};

export type HybridKeywordResult = {
  id: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  source: string;
  snippet?: string;
  textScore: number;
};

/**
 * Merge hybrid search results with weighted scoring
 */
export function mergeHybridResults(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  vectorWeight: number;
  textWeight: number;
}): Array<{
  id: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  score: number;
  snippet?: string;
  source: string;
}> {
  // Map to store combined results by ID
  const byId = new Map<
    string,
    {
      id: string;
      path?: string;
      startLine?: number;
      endLine?: number;
      source: string;
      snippet?: string;
      vectorScore: number;
      textScore: number;
    }
  >();

  // Add vector results
  for (const r of params.vector) {
    byId.set(r.id, {
      id: r.id,
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      source: r.source,
      snippet: r.snippet,
      vectorScore: r.vectorScore,
      textScore: 0,
    });
  }

  // Merge keyword results
  for (const r of params.keyword) {
    const existing = byId.get(r.id);
    if (existing) {
      existing.textScore = r.textScore;
      // Prefer snippet from the better-scoring source
      if (r.snippet && r.snippet.length > 0) {
        existing.snippet = r.snippet;
      }
      // Prefer source from vector search
      if (r.source && existing.source !== r.source) {
        existing.source = r.source;
      }
    } else {
      byId.set(r.id, {
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        source: r.source,
        snippet: r.snippet,
        vectorScore: 0,
        textScore: r.textScore,
      });
    }
  }

  // Calculate combined scores and return sorted results
  const merged = Array.from(byId.values()).map((entry) => ({
    id: entry.id,
    path: entry.path,
    startLine: entry.startLine,
    endLine: entry.endLine,
    score: params.vectorWeight * entry.vectorScore + params.textWeight * entry.textScore,
    snippet: entry.snippet,
    source: entry.source,
  }));

  return merged.sort((a, b) => b.score - a.score);
}

/**
 * Re-rank results using reciprocal rank fusion
 */
export function reciprocalRankFusion(
  rankings: Array<Array<{ id: string; score: number }>>,
  k = 60,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    for (let i = 0; i < ranking.length; i++) {
      const item = ranking[i]!;
      const existing = scores.get(item.id) ?? 0;
      scores.set(item.id, existing + 1 / (k + i + 1));
    }
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Normalize scores to 0-1 range using min-max scaling
 */
export function normalizeScores(
  results: Array<{ id: string; score: number }>,
): Array<{ id: string; score: number }> {
  if (results.length === 0) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const r of results) {
    if (r.score < min) min = r.score;
    if (r.score > max) max = r.score;
  }

  const range = max - min || 1;

  return results.map((r) => ({
    id: r.id,
    score: (r.score - min) / range,
  }));
}
