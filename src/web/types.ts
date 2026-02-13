/**
 * Web 模块类型定义
 */

/** WebSocket 请求帧 */
export interface WsRequestFrame {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
}

/** WebSocket 响应帧 */
export interface WsResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** WebSocket 事件帧 */
export interface WsEventFrame {
  type: "event";
  event: string;
  payload?: unknown;
}

/** WebSocket 帧类型 */
export type WsFrame = WsRequestFrame | WsResponseFrame | WsEventFrame;

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

/** 聊天请求参数 */
export interface ChatSendParams {
  message: string;
  sessionKey?: string;
}

/** 会话列表请求参数 */
export interface SessionsListParams {
  limit?: number;
  activeMinutes?: number;
  search?: string;
}

/** 会话历史请求参数 */
export interface SessionsHistoryParams {
  sessionKey: string;
}

/** 会话删除请求参数 */
export interface SessionsDeleteParams {
  sessionKey: string;
}

/** 会话重置请求参数 */
export interface SessionsResetParams {
  sessionKey: string;
}

/** 恢复会话请求参数 */
export interface SessionsRestoreParams {
  sessionKey: string;
}

/** 聊天流事件 */
export interface ChatDeltaEvent {
  sessionId: string;
  delta: string;
  done: boolean;
  /** 是否为用户取消 */
  cancelled?: boolean;
}

/** 会话信息 */
export interface SessionInfo {
  id: string;
  messageCount: number;
  lastUpdate: number;
  provider: string;
  model: string;
}

/** 系统状态 */
export interface SystemStatus {
  version: string;
  uptime: number;
  providers: Array<{
    id: string;
    name: string;
    available: boolean;
  }>;
  channels: Array<{
    id: string;
    name: string;
    connected: boolean;
  }>;
  sessions: number;
}

/** 配置信息 */
export interface ConfigInfo {
  providers: Record<string, ProviderConfigInfo>;
  channels: Record<string, ChannelConfigInfo>;
  agent: AgentConfigInfo;
  server: ServerConfigInfo;
  logging: LoggingConfigInfo;
  memory: MemoryConfigInfo;
  skills: SkillsConfigInfo;
}

/** 提供商配置信息（脱敏） */
export interface ProviderConfigInfo {
  id: string;
  name?: string;
  baseUrl?: string;
  hasApiKey: boolean;
  groupId?: string;
}

/** 通道配置信息（脱敏） */
export interface ChannelConfigInfo {
  id: string;
  name: string;
  hasConfig: boolean;
  enabled?: boolean;
  // 飞书
  appId?: string;
  // 钉钉
  appKey?: string;
  robotCode?: string;
  // QQ
  sandbox?: boolean;
  // 企业微信
  corpId?: string;
  agentId?: number;
  token?: string;
  encodingAESKey?: string;
}

/** Agent 配置信息 */
export interface AgentConfigInfo {
  defaultProvider: string;
  defaultModel: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

/** 服务器配置信息 */
export interface ServerConfigInfo {
  port: number;
  host: string;
}

/** 日志配置信息 */
export interface LoggingConfigInfo {
  level: "debug" | "info" | "warn" | "error";
}

/** 记忆系统配置信息 */
export interface MemoryConfigInfo {
  enabled?: boolean;
  directory?: string;
  embeddingModel?: string;
  embeddingProvider?: string;
}

/** Skills 配置信息 */
export interface SkillsConfigInfo {
  enabled?: boolean;
  userDir?: string;
  workspaceDir?: string;
  disabled?: string[];
  only?: string[];
}

/** 保存配置请求参数 */
export interface ConfigSaveParams {
  providers?: Record<string, ProviderConfigInfo>;
  channels?: Record<string, ChannelConfigInfo & {
    appId?: string;
    appSecret?: string;
    appKey?: string;
    corpId?: string;
    corpSecret?: string;
    agentId?: number;
    token?: string;
    encodingAESKey?: string;
    clientSecret?: string;
    verificationToken?: string;
    encryptKey?: string;
    sandbox?: boolean;
    robotCode?: string;
  }>;
  agent?: AgentConfigInfo;
  server?: ServerConfigInfo;
  logging?: LoggingConfigInfo;
  memory?: MemoryConfigInfo;
  skills?: SkillsConfigInfo;
}

/** 配置验证结果 */
export interface ConfigValidateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
