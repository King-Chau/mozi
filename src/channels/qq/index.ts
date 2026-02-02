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
        // QQ 群消息 (v2 API)
        const groupOpenId = chatId.replace("group:", "");
        this.logger.debug({ groupOpenId, hasReplyToId: !!replyToId }, "Sending group message");
        await this.apiClient.sendGroupMessage(groupOpenId, content, replyToId);
      } else if (chatId.startsWith("c2c:")) {
        // QQ 私聊消息 (v2 API)
        const openId = chatId.replace("c2c:", "");
        this.logger.debug({ openId, hasReplyToId: !!replyToId }, "Sending direct message");
        await this.apiClient.sendDirectMessage(openId, content, replyToId);
      } else if (chatId.startsWith("dms:")) {
        // 频道私信
        const guildId = chatId.replace("dms:", "");
        this.logger.debug({ guildId, hasReplyToId: !!replyToId }, "Sending DM message");
        await this.apiClient.sendDMMessage(guildId, content, replyToId);
      } else if (chatId.startsWith("channel:")) {
        // 频道消息 (明确指定)
        const channelId = chatId.replace("channel:", "");
        this.logger.debug({ channelId, hasReplyToId: !!replyToId }, "Sending channel message");
        await this.apiClient.sendChannelMessage(channelId, content, replyToId);
      } else {
        // 默认作为频道消息处理 (为了向后兼容)
        this.logger.debug({ chatId, hasReplyToId: !!replyToId }, "Sending channel message (default)");
        await this.apiClient.sendChannelMessage(chatId, content, replyToId);
      }

      return { success: true };
    } catch (error: unknown) {
      // 提取详细错误信息
      let errorMessage = error instanceof Error ? error.message : String(error);
      let errorCode: number | undefined;
      let errorDetails: string | undefined;

      // 尝试从 Axios 错误中提取更多信息
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as { response?: { data?: { code?: number; message?: string }; status?: number } };
        if (axiosError.response?.data) {
          errorCode = axiosError.response.data.code;
          errorDetails = axiosError.response.data.message;
          errorMessage = `[${errorCode}] ${errorDetails || errorMessage}`;
        }
      }

      this.logger.error({ error, chatId: message.chatId, errorCode, errorDetails }, "Failed to send message");
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
