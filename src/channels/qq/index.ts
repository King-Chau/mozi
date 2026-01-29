/**
 * QQ 通道适配器
 *
 * 使用 WebSocket 长连接模式，无需公网部署
 */

import type {
  QQConfig,
  ChannelMeta,
  OutboundMessage,
  SendResult,
} from "../../types/index.js";
import { BaseChannelAdapter } from "../common/base.js";
import { QQApiClient } from "./api.js";
import { QQWebSocketClient } from "./websocket.js";
import { getChildLogger } from "../../utils/logger.js";

/** QQ 通道元数据 */
const QQ_META: ChannelMeta = {
  id: "qq",
  name: "QQ",
  description: "QQ 机器人 (官方 API)",
  capabilities: {
    chatTypes: ["direct", "group"],
    supportsMedia: true,
    supportsReply: true,
    supportsMention: true,
    supportsReaction: false,
    supportsThread: false,
    supportsEdit: false,
    maxMessageLength: 4096,
  },
};

export class QQChannel extends BaseChannelAdapter {
  readonly id = "qq" as const;
  readonly meta = QQ_META;

  private config: QQConfig;
  private apiClient: QQApiClient;
  private wsClient: QQWebSocketClient | null = null;
  private initialized = false;

  constructor(config: QQConfig) {
    super();
    this.config = config;
    this.apiClient = new QQApiClient(config);
    this.logger = getChildLogger("qq");
  }

  /** 初始化通道 */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info("Initializing QQ channel");

    // 验证配置
    if (!this.config.appId || !this.config.clientSecret) {
      throw new Error("QQ appId and clientSecret are required");
    }

    // 测试获取 token
    try {
      await this.apiClient.getAccessToken();
      this.logger.info("Successfully authenticated with QQ");
    } catch (error) {
      this.logger.error({ error }, "Failed to authenticate with QQ");
      throw error;
    }

    // 启动 WebSocket 连接
    await this.startWebSocket();

    this.initialized = true;
  }

  /** 启动 WebSocket 连接 */
  private async startWebSocket(): Promise<void> {
    this.logger.info("Starting QQ WebSocket client");
    this.wsClient = new QQWebSocketClient(this.config);

    // 设置事件处理器
    this.wsClient.setEventHandler(async (context) => {
      await this.handleInboundMessage(context);
    });

    // 启动连接
    await this.wsClient.start();
  }

  /** 关闭通道 */
  async shutdown(): Promise<void> {
    this.logger.info("Shutting down QQ channel");

    if (this.wsClient) {
      await this.wsClient.stop();
      this.wsClient = null;
    }

    this.initialized = false;
  }

  /** 发送消息 */
  async sendMessage(message: OutboundMessage): Promise<SendResult> {
    try {
      const { chatId, content, replyToId } = message;

      // 根据 chatId 前缀判断消息类型
      if (chatId.startsWith("group:")) {
        // QQ 群消息
        const groupOpenId = chatId.replace("group:", "");
        await this.apiClient.sendGroupMessage(groupOpenId, content, replyToId);
      } else if (chatId.startsWith("c2c:")) {
        // QQ 私聊消息
        const openId = chatId.replace("c2c:", "");
        await this.apiClient.sendDirectMessage(openId, content, replyToId);
      } else if (chatId.startsWith("dms:")) {
        // 频道私信
        const guildId = chatId.replace("dms:", "");
        await this.apiClient.sendDMMessage(guildId, content, replyToId);
      } else {
        // 默认作为频道消息处理
        await this.apiClient.sendChannelMessage(chatId, content, replyToId);
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ error, message }, "Failed to send message");
      return { success: false, error: errorMessage };
    }
  }

  /** 发送文本消息 */
  async sendText(chatId: string, text: string, replyToId?: string): Promise<SendResult> {
    return this.sendMessage({ chatId, content: text, replyToId });
  }

  /** 检查通道状态 */
  async isHealthy(): Promise<boolean> {
    try {
      // 检查 API 认证
      await this.apiClient.getAccessToken();

      // 检查 WebSocket 连接状态
      if (this.wsClient) {
        return this.wsClient.checkConnected();
      }

      return true;
    } catch {
      return false;
    }
  }

  /** 获取 API 客户端 */
  getApiClient(): QQApiClient {
    return this.apiClient;
  }

  /** 检查是否使用长连接 */
  isUsingWebSocket(): boolean {
    return this.wsClient !== null;
  }
}

/** 创建 QQ 通道 */
export function createQQChannel(config: QQConfig): QQChannel {
  return new QQChannel(config);
}
