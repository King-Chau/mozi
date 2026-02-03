/**
 * WebSocket 服务器 - 提供实时通信
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { getChildLogger } from "../utils/logger.js";
import { generateId } from "../utils/index.js";
import type {
  WsFrame,
  WsRequestFrame,
  WsResponseFrame,
  WsEventFrame,
  ChatSendParams,
  ChatDeltaEvent,
  SystemStatus,
  SessionsListParams,
  SessionsHistoryParams,
  SessionsDeleteParams,
  SessionsResetParams,
  SessionsRestoreParams,
  ConfigInfo,
  ConfigSaveParams,
  ConfigValidateResult,
} from "./types.js";
import type { Agent } from "../agents/agent.js";
import type { MoziConfig, ProviderId } from "../types/index.js";
import { getAllProviders } from "../providers/index.js";
import { getAllChannels } from "../channels/index.js";
import { getSessionStore, type TranscriptMessage } from "../sessions/index.js";
import { join } from "path";
import { homedir } from "os";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import json5 from "json5";
const logger = getChildLogger("websocket");

/** WebSocket 客户端 */
interface WsClient {
  id: string;
  ws: WebSocket;
  sessionKey: string | null;  // null 表示尚未绑定 session
  sessionId: string | null;
  lastPing: number;
}

/** WebSocket 服务选项 */
export interface WsServerOptions {
  server: HttpServer;
  agent: Agent;
  config: MoziConfig;
  /** 心跳检测间隔 (毫秒), 默认 30000 */
  heartbeatInterval?: number;
  /** 客户端超时时间 (毫秒), 默认 60000 */
  clientTimeout?: number;
}

/** WebSocket 服务器类 */
export class WsServer {
  private wss: WebSocketServer;
  private clients = new Map<string, WsClient>();
  private agent: Agent;
  private config: MoziConfig;
  private startTime = Date.now();
  private heartbeatInterval: number;
  private clientTimeout: number;

  constructor(options: WsServerOptions) {
    this.agent = options.agent;
    this.config = options.config;
    this.heartbeatInterval = options.heartbeatInterval ?? 30000;
    this.clientTimeout = options.clientTimeout ?? 60000;

    this.wss = new WebSocketServer({
      server: options.server,
      path: "/ws",
    });

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws);
    });

    // 心跳检测
    setInterval(() => this.checkHeartbeat(), this.heartbeatInterval);

    logger.info("WebSocket server initialized");
  }

  /** 处理新连接 */
  private async handleConnection(ws: WebSocket): Promise<void> {
    const clientId = generateId("client");

    // 不立即创建 session，等待客户端发送 sessions.restore 或 chat.send 时再创建
    const client: WsClient = {
      id: clientId,
      ws,
      sessionKey: null,
      sessionId: null,
      lastPing: Date.now(),
    };

    this.clients.set(clientId, client);
    logger.info({ clientId }, "Client connected");

    // 发送欢迎消息 - 不包含 session 信息，等待客户端决定
    this.sendEvent(ws, "connected", {
      clientId,
      version: "1.0.0",
    });

    ws.on("message", (data) => {
      this.handleMessage(client, data.toString());
    });

    ws.on("close", () => {
      this.clients.delete(clientId);
      logger.info({ clientId }, "Client disconnected");
    });

    ws.on("error", (error) => {
      logger.error({ clientId, error }, "WebSocket error");
    });

    ws.on("pong", () => {
      client.lastPing = Date.now();
    });
  }

  /** 处理消息 */
  private async handleMessage(client: WsClient, data: string): Promise<void> {
    try {
      const frame = JSON.parse(data) as WsFrame;

      if (frame.type === "req") {
        await this.handleRequest(client, frame);
      }
    } catch (error) {
      logger.error({ error, data }, "Failed to handle message");
    }
  }

  /** 处理请求 */
  private async handleRequest(
    client: WsClient,
    frame: WsRequestFrame
  ): Promise<void> {
    const { id, method, params } = frame;

    try {
      let result: unknown;

      switch (method) {
        case "chat.send":
          result = await this.handleChatSend(client, params as ChatSendParams);
          break;
        case "chat.clear":
          result = await this.handleChatClear(client);
          break;
        case "sessions.list":
          result = await this.handleSessionsList(params as SessionsListParams);
          break;
        case "sessions.history":
          result = await this.handleSessionsHistory(params as SessionsHistoryParams);
          break;
        case "sessions.delete":
          result = await this.handleSessionsDelete(params as SessionsDeleteParams);
          break;
        case "sessions.reset":
          result = await this.handleSessionsReset(params as SessionsResetParams);
          break;
        case "sessions.restore":
          result = await this.handleSessionsRestore(client, params as SessionsRestoreParams);
          break;
        case "status.get":
          result = this.getSystemStatus();
          break;
        case "session.info":
          result = this.getSessionInfo(client);
          break;
        case "config.get":
          result = this.getConfigInfo();
          break;
        case "config.validate":
          result = this.validateConfig(params as ConfigSaveParams);
          break;
        case "config.save":
          result = await this.saveConfig(params as ConfigSaveParams);
          break;
        case "ping":
          result = { pong: Date.now() };
          break;
        default:
          throw new Error(`Unknown method: ${method}`);
      }

      this.sendResponse(client.ws, id, true, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendResponse(client.ws, id, false, undefined, {
        code: "ERROR",
        message,
      });
    }
  }

  /** 确保客户端有 session，如果没有则创建 */
  private async ensureSession(client: WsClient): Promise<void> {
    if (client.sessionKey && client.sessionId) {
      return;
    }

    const store = getSessionStore();
    const sessionKey = `webchat:${client.id}`;
    const session = await store.getOrCreate(sessionKey);

    client.sessionKey = sessionKey;
    client.sessionId = session.sessionId;

    logger.info({ clientId: client.id, sessionKey, sessionId: session.sessionId }, "Session created");
  }

  /** 处理聊天发送 */
  private async handleChatSend(
    client: WsClient,
    params: ChatSendParams
  ): Promise<{ messageId: string }> {
    // 确保有 session
    await this.ensureSession(client);

    const { message } = params;
    const messageId = generateId("msg");
    const store = getSessionStore();

    // 构造消息上下文
    // 使用 sessionKey 作为 senderId，确保会话恢复后 Agent 能找到历史上下文
    const stableSenderId = client.sessionKey!.replace("webchat:", "");

    logger.debug(
      { clientId: client.id, sessionKey: client.sessionKey, stableSenderId, message: message.slice(0, 100) },
      "Chat send"
    );

    // 保存用户消息到 transcript
    const userMessage: TranscriptMessage = {
      id: messageId,
      role: "user",
      content: message,
      timestamp: Date.now(),
    };
    await store.appendTranscript(client.sessionId!, client.sessionKey!, userMessage);

    const context = {
      channelId: "webchat" as const,
      chatId: client.sessionKey!,
      messageId,
      senderId: stableSenderId,
      senderName: "WebChat User",
      content: message,
      chatType: "direct" as const,
      timestamp: Date.now(),
    };

    // 流式处理
    try {
      const stream = this.agent.processMessageStream(context);
      let fullContent = "";

      for await (const delta of stream) {
        fullContent += delta;
        this.sendEvent(client.ws, "chat.delta", {
          sessionId: client.sessionId,
          delta,
          done: false,
        } as ChatDeltaEvent);
      }

      // 保存助手消息到 transcript
      const assistantMessage: TranscriptMessage = {
        id: generateId("msg"),
        role: "assistant",
        content: fullContent,
        timestamp: Date.now(),
      };
      await store.appendTranscript(client.sessionId!, client.sessionKey!, assistantMessage);

      // 发送完成事件
      this.sendEvent(client.ws, "chat.delta", {
        sessionId: client.sessionId,
        delta: "",
        done: true,
      } as ChatDeltaEvent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendEvent(client.ws, "chat.error", {
        sessionId: client.sessionId,
        error: errorMessage,
      });
    }

    return { messageId };
  }

  /** 处理清除会话 */
  private async handleChatClear(client: WsClient): Promise<{ success: boolean; sessionKey: string; sessionId: string }> {
    // 确保有 session
    await this.ensureSession(client);

    const store = getSessionStore();
    const oldSessionKey = client.sessionKey!;

    // 重置会话
    const newSession = await store.reset(client.sessionKey!);

    // 更新客户端会话 ID 和 sessionKey
    client.sessionKey = newSession.sessionKey;
    client.sessionId = newSession.sessionId;

    logger.info(
      { clientId: client.id, oldSessionKey, newSessionKey: newSession.sessionKey, newSessionId: newSession.sessionId },
      "Chat cleared, new session created"
    );

    return {
      success: true,
      sessionKey: newSession.sessionKey,
      sessionId: newSession.sessionId,
    };
  }

  /** 处理会话列表 */
  private async handleSessionsList(params?: SessionsListParams): Promise<unknown> {
    const store = getSessionStore();
    const sessions = await store.list({
      limit: params?.limit,
      activeMinutes: params?.activeMinutes,
      search: params?.search,
    });
    return { sessions };
  }

  /** 处理获取会话历史 */
  private async handleSessionsHistory(params: SessionsHistoryParams): Promise<unknown> {
    const store = getSessionStore();
    const session = await store.get(params.sessionKey);
    if (!session) {
      throw new Error(`Session not found: ${params.sessionKey}`);
    }
    const messages = await store.loadTranscript(session.sessionId);
    return {
      sessionKey: params.sessionKey,
      sessionId: session.sessionId,
      messages,
    };
  }

  /** 处理删除会话 */
  private async handleSessionsDelete(params: SessionsDeleteParams): Promise<{ success: boolean }> {
    const store = getSessionStore();
    await store.delete(params.sessionKey);
    return { success: true };
  }

  /** 处理重置会话 */
  private async handleSessionsReset(params: SessionsResetParams): Promise<unknown> {
    const store = getSessionStore();
    const session = await store.reset(params.sessionKey);
    return {
      success: true,
      sessionKey: session.sessionKey,
      sessionId: session.sessionId,
    };
  }

  /** 处理恢复会话 */
  private async handleSessionsRestore(client: WsClient, params: SessionsRestoreParams): Promise<unknown> {
    const store = getSessionStore();
    const session = await store.get(params.sessionKey);
    if (!session) {
      throw new Error(`Session not found: ${params.sessionKey}`);
    }

    // 更新客户端会话
    client.sessionKey = session.sessionKey;
    client.sessionId = session.sessionId;

    // 加载历史消息
    const messages = await store.loadTranscript(session.sessionId);

    // 恢复 Agent 的会话上下文
    // Agent 使用 "webchat:{senderId}" 作为 sessionKey，对于 direct chat
    // senderId 从 sessionKey 中提取（去掉 "webchat:" 前缀）
    const agentSessionKey = session.sessionKey; // webchat:session_xxx
    const transcriptMessages = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string }));

    if (transcriptMessages.length > 0) {
      this.agent.restoreSessionFromTranscript(agentSessionKey, transcriptMessages);
    }

    return {
      sessionKey: session.sessionKey,
      sessionId: session.sessionId,
      messages,
    };
  }

  /** 获取系统状态 */
  private getSystemStatus(): SystemStatus {
    const providers = getAllProviders().map((p) => ({
      id: p.id,
      name: p.name,
      available: true,
    }));

    const channels = getAllChannels().map((c) => ({
      id: c.id,
      name: c.id,  // 使用 id 作为 name
      connected: true,  // 简化：假设已配置的通道都是连接的
    }));

    return {
      version: "1.0.0",
      uptime: Date.now() - this.startTime,
      providers,
      channels,
      sessions: this.clients.size,
    };
  }

  /** 获取会话信息 */
  private getSessionInfo(client: WsClient): unknown {
    const context = {
      channelId: "webchat" as const,
      chatId: client.sessionKey || `webchat:${client.id}`,
      messageId: "",
      senderId: client.id,
      senderName: "",
      content: "",
      chatType: "direct" as const,
      timestamp: Date.now(),
    };

    const info = this.agent.getSessionInfo(context);
    return {
      sessionKey: client.sessionKey,
      sessionId: client.sessionId,
      ...info,
    };
  }

  /** 获取配置信息（脱敏） */
  private getConfigInfo(): ConfigInfo {
    // 提供商信息（脱敏 API Key）
    const providers: Record<string, ConfigInfo["providers"][string]> = {};
    for (const [id, config] of Object.entries(this.config.providers)) {
      providers[id] = {
        id,
        name: (config as any).name || id,
        baseUrl: (config as any).baseUrl,
        hasApiKey: Boolean((config as any).apiKey),
        groupId: (config as any).groupId,
      };
    }

    // 通道信息（脱敏敏感字段）
    const channels: Record<string, ConfigInfo["channels"][string]> = {};
    const channelNames: Record<string, string> = {
      feishu: "飞书",
      dingtalk: "钉钉",
      qq: "QQ",
      wecom: "企业微信",
    };
    for (const [id, config] of Object.entries(this.config.channels)) {
      if (config) {
        const channelConfig: ConfigInfo["channels"][string] = {
          id,
          name: channelNames[id] || id,
          hasConfig: true,
          enabled: (config as any).enabled ?? true,
        };
        // 添加非敏感字段用于编辑
        if (id === "feishu") {
          (channelConfig as any).appId = (config as any).appId;
          // appSecret 不返回
        } else if (id === "dingtalk") {
          (channelConfig as any).appKey = (config as any).appKey;
          (channelConfig as any).robotCode = (config as any).robotCode;
        } else if (id === "qq") {
          (channelConfig as any).appId = (config as any).appId;
          (channelConfig as any).sandbox = (config as any).sandbox;
          // clientSecret 不返回
        } else if (id === "wecom") {
          (channelConfig as any).corpId = (config as any).corpId;
          (channelConfig as any).agentId = (config as any).agentId;
          (channelConfig as any).token = (config as any).token;
          (channelConfig as any).encodingAESKey = (config as any).encodingAESKey;
          // corpSecret 不返回
        }
        channels[id] = channelConfig;
      }
    }

    // Agent 配置
    const agent = {
      defaultProvider: this.config.agent.defaultProvider,
      defaultModel: this.config.agent.defaultModel,
      temperature: this.config.agent.temperature,
      maxTokens: this.config.agent.maxTokens,
      systemPrompt: this.config.agent.systemPrompt,
    };

    // 服务器配置
    const server = {
      port: this.config.server.port,
      host: this.config.server.host || "0.0.0.0",
    };

    // 日志配置
    const logging = {
      level: this.config.logging.level,
    };

    // 记忆系统配置
    const memory = {
      enabled: this.config.memory?.enabled,
      directory: this.config.memory?.directory,
      embeddingModel: this.config.memory?.embeddingModel,
      embeddingProvider: this.config.memory?.embeddingProvider,
    };

    // Skills 配置
    const skills = {
      enabled: this.config.skills?.enabled,
      userDir: this.config.skills?.userDir,
      workspaceDir: this.config.skills?.workspaceDir,
      disabled: this.config.skills?.disabled,
      only: this.config.skills?.only,
    };

    return {
      providers,
      channels,
      agent,
      server,
      logging,
      memory: memory as ConfigInfo["memory"],
      skills: skills as ConfigInfo["skills"],
    };
  }

  /** 验证配置 */
  private validateConfig(params: ConfigSaveParams): ConfigValidateResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证提供商
    if (params.providers) {
      let hasApiKey = false;
      for (const [id, p] of Object.entries(params.providers)) {
        if (p.hasApiKey) {
          hasApiKey = true;
        }
        // 验证自定义 OpenAI/Anthropic 需要 baseUrl
        if (p.hasApiKey && (id === "custom-openai" || id === "custom-anthropic")) {
          if (!p.baseUrl) {
            errors.push(`${id} 需要 baseUrl 配置`);
          }
        }
      }
      if (!hasApiKey && Object.keys(params.providers).length > 0) {
        warnings.push("没有配置任何 API Key，将无法使用模型功能");
      }
    }

    // 验证通道
    if (params.channels) {
      for (const [id, c] of Object.entries(params.channels)) {
        if (c.hasConfig) {
          if (id === "feishu" && !c.appId) {
            errors.push("飞书需要 App ID");
          }
          if (id === "dingtalk" && !c.appKey) {
            errors.push("钉钉需要 App Key");
          }
          if (id === "qq" && !c.appId) {
            errors.push("QQ 需要 App ID");
          }
          if (id === "wecom" && !c.corpId) {
            errors.push("企业微信需要 Corp ID");
          }
        }
      }
    }

    // 验证 Agent 配置
    if (params.agent) {
      const validProviders = [
        "deepseek", "doubao", "minimax", "kimi", "stepfun", "modelscope",
        "dashscope", "zhipu", "openai", "ollama", "openrouter",
        "together", "groq", "custom-openai", "custom-anthropic",
      ];
      if (params.agent.defaultProvider && !validProviders.includes(params.agent.defaultProvider)) {
        errors.push(`无效的提供商: ${params.agent.defaultProvider}`);
      }
      if (params.agent.temperature !== undefined && (params.agent.temperature < 0 || params.agent.temperature > 2)) {
        errors.push("temperature 必须在 0 到 2 之间");
      }
      if (params.agent.maxTokens !== undefined && params.agent.maxTokens < 1) {
        errors.push("maxTokens 必须大于 0");
      }
    }

    // 验证服务器配置
    if (params.server) {
      if (params.server.port < 1 || params.server.port > 65535) {
        errors.push("端口必须在 1 到 65535 之间");
      }
    }

    // 验证日志配置
    if (params.logging) {
      const validLevels = ["debug", "info", "warn", "error"];
      if (params.logging.level && !validLevels.includes(params.logging.level)) {
        errors.push(`无效的日志级别: ${params.logging.level}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /** 保存配置到文件 */
  private async saveConfig(params: ConfigSaveParams): Promise<{ success: boolean; message: string; requiresRestart?: boolean }> {
    const moziDir = join(homedir(), ".mozi");
    const configPath = join(moziDir, "config.local.json5");

    // 验证配置
    const validation = this.validateConfig(params);
    if (!validation.valid) {
      return {
        success: false,
        message: "配置验证失败: " + validation.errors.join("; "),
      };
    }

    // 先读取现有配置，然后合并
    let existingConfig: Partial<MoziConfig> = {};
    if (existsSync(configPath)) {
      try {
        existingConfig = json5.parse(readFileSync(configPath, "utf-8"));
      } catch (e) {
        logger.warn({ error: e }, "Failed to parse existing config, creating new");
      }
    }

    // 构建要保存的配置
    const configToSave: Partial<MoziConfig> = { ...existingConfig };

    // 更新提供商
    if (params.providers) {
      const providers: MoziConfig["providers"] = {};
      // 保留原有的未修改的提供商
      if (existingConfig.providers) {
        for (const [id, p] of Object.entries(existingConfig.providers)) {
          if (id && p) {
            providers[id] = p;
          }
        }
      }
      // 更新/添加新的提供商
      for (const [id, p] of Object.entries(params.providers)) {
        if (!id || !p.hasApiKey) {
          // 删除提供商
          delete providers[id];
          continue;
        }
        // 从现有配置中获取 apiKey
        const existing = (existingConfig.providers as any)?.[id];
        providers[id] = {
          ...existing,
          baseUrl: p.baseUrl,
          ...(p.groupId ? { groupId: p.groupId } : {}),
        };
        // 保留 apiKey（前端不发送，需要从原有配置中获取）
        if (existing?.apiKey) {
          (providers[id] as any).apiKey = existing.apiKey;
        }
      }
      configToSave.providers = providers;
    }

    // 更新通道
    if (params.channels) {
      const channels: MoziConfig["channels"] = {
        feishu: existingConfig.channels?.feishu,
        dingtalk: existingConfig.channels?.dingtalk,
        qq: existingConfig.channels?.qq,
        wecom: existingConfig.channels?.wecom,
      };

      for (const [id, c] of Object.entries(params.channels)) {
        if (!c.hasConfig) {
          // 删除通道配置
          delete (channels as any)[id];
          continue;
        }
        const existing = (existingConfig.channels as any)?.[id];
        (channels as any)[id] = {
          ...existing,
          enabled: c.enabled,
          ...(c.appId && { appId: c.appId }),
          ...(c.appSecret && { appSecret: c.appSecret }),
          ...(c.appKey && { appKey: c.appKey }),
          ...(c.corpId && { corpId: c.corpId }),
          ...(c.corpSecret && { corpSecret: c.corpSecret }),
          ...(c.agentId && { agentId: c.agentId }),
          ...(c.token && { token: c.token }),
          ...(c.encodingAESKey && { encodingAESKey: c.encodingAESKey }),
          ...(c.clientSecret && { clientSecret: c.clientSecret }),
          ...(c.verificationToken && { verificationToken: c.verificationToken }),
          ...(c.encryptKey && { encryptKey: c.encryptKey }),
          ...(c.sandbox !== undefined && { sandbox: c.sandbox }),
          ...(c.robotCode && { robotCode: c.robotCode }),
        };
      }
      configToSave.channels = channels;
    }

    // 更新 Agent 配置
    if (params.agent) {
      configToSave.agent = {
        ...existingConfig.agent,
        ...params.agent,
        defaultProvider: (params.agent.defaultProvider as ProviderId) || (existingConfig.agent?.defaultProvider ?? "deepseek"),
      };
    }

    // 更新服务器配置
    if (params.server) {
      configToSave.server = {
        ...existingConfig.server,
        ...params.server,
      };
    }

    // 更新日志配置
    if (params.logging) {
      configToSave.logging = {
        ...existingConfig.logging,
        ...params.logging,
      };
    }

    // 更新记忆系统配置
    if (params.memory) {
      configToSave.memory = {
        ...existingConfig.memory,
        ...params.memory,
        embeddingProvider: params.memory.embeddingProvider as ProviderId | undefined,
      };
    }

    // 更新 Skills 配置
    if (params.skills) {
      configToSave.skills = {
        ...existingConfig.skills,
        ...params.skills,
      };
    }

    // 确保目录存在
    if (!existsSync(moziDir)) {
      mkdirSync(moziDir, { recursive: true });
    }

    // 生成 JSON5 格式
    const json5Content = this.generateJson5(configToSave);

    // 写入文件
    writeFileSync(configPath, json5Content, "utf-8");

    logger.info({ configPath }, "Configuration saved");

    // 检查是否需要重启
    let requiresRestart = false;
    if (params.server?.port && params.server.port !== this.config.server.port) {
      requiresRestart = true;
    }
    if (params.channels) {
      // 如果新增或删除了通道，需要重启
      for (const [id, c] of Object.entries(params.channels)) {
        const existingHasConfig = Boolean((existingConfig.channels as any)?.[id]);
        if (c.hasConfig !== existingHasConfig) {
          requiresRestart = true;
          break;
        }
      }
    }

    return {
      success: true,
      message: "配置已保存" + (requiresRestart ? "，需要重启服务才能生效" : ""),
      requiresRestart,
    };
  }

  /** 生成 JSON5 格式的配置字符串 */
  private generateJson5(obj: unknown, indent = 0): string {
    const spaces = "  ".repeat(indent);
    const innerSpaces = "  ".repeat(indent + 1);

    if (obj === null || obj === undefined) {
      return "null";
    }

    if (typeof obj === "string") {
      return `"${obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }

    if (typeof obj === "number" || typeof obj === "boolean") {
      return String(obj);
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return "[]";
      const items = obj.map((item) => `${innerSpaces}${this.generateJson5(item, indent + 1)}`);
      return `[\n${items.join(",\n")}\n${spaces}]`;
    }

    if (typeof obj === "object") {
      const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return "{}";

      const items = entries.map(([key, value]) => {
        // 使用不带引号的 key（如果是有效的 ECMAScript 标识符）
        const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
        return `${innerSpaces}${safeKey}: ${this.generateJson5(value, indent + 1)}`;
      });

      return `{\n${items.join(",\n")}\n${spaces}}`;
    }

    return String(obj);
  }

  /** 发送响应 */
  private sendResponse(
    ws: WebSocket,
    id: string,
    ok: boolean,
    payload?: unknown,
    error?: { code: string; message: string }
  ): void {
    const frame: WsResponseFrame = { type: "res", id, ok, payload, error };
    ws.send(JSON.stringify(frame));
  }

  /** 发送事件 */
  private sendEvent(ws: WebSocket, event: string, payload?: unknown): void {
    const frame: WsEventFrame = { type: "event", event, payload };
    ws.send(JSON.stringify(frame));
  }

  /** 广播事件 */
  broadcast(event: string, payload?: unknown): void {
    const frame: WsEventFrame = { type: "event", event, payload };
    const data = JSON.stringify(frame);

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  /** 心跳检测 */
  private checkHeartbeat(): void {
    const now = Date.now();

    for (const [clientId, client] of this.clients) {
      if (now - client.lastPing > this.clientTimeout) {
        logger.info({ clientId }, "Client timeout, disconnecting");
        client.ws.terminate();
        this.clients.delete(clientId);
      } else {
        client.ws.ping();
      }
    }
  }

  /** 关闭服务器 */
  close(): void {
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.wss.close();
    logger.info("WebSocket server closed");
  }
}
