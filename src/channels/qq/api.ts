/**
 * QQ 机器人 API 客户端
 * 基于 QQ 官方机器人 API v2
 */

import axios, { type AxiosInstance } from "axios";
import { getChildLogger } from "../../utils/logger.js";
import type { QQConfig } from "../../types/index.js";

const logger = getChildLogger("qq-api");

/** QQ API 基础地址 */
const QQ_API_BASE = "https://api.sgroup.qq.com";
const QQ_SANDBOX_API_BASE = "https://sandbox.api.sgroup.qq.com";

/** Token 获取地址 */
const QQ_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";

/** Access Token 缓存 */
interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

/** 发送消息响应 */
interface SendMessageResponse {
  id: string;
  timestamp: number;
}

export class QQApiClient {
  private config: QQConfig;
  private client: AxiosInstance;
  private tokenCache: TokenCache | null = null;

  constructor(config: QQConfig) {
    this.config = config;
    const baseURL = config.sandbox ? QQ_SANDBOX_API_BASE : QQ_API_BASE;
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /** 获取 Access Token */
  async getAccessToken(): Promise<string> {
    // 检查缓存
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60000) {
      return this.tokenCache.accessToken;
    }

    try {
      const response = await axios.post(QQ_TOKEN_URL, {
        appId: this.config.appId,
        clientSecret: this.config.clientSecret,
      });

      const { access_token, expires_in } = response.data;

      this.tokenCache = {
        accessToken: access_token,
        expiresAt: Date.now() + expires_in * 1000,
      };

      logger.debug("Access token refreshed");
      return access_token;
    } catch (error) {
      logger.error({ error }, "Failed to get access token");
      throw error;
    }
  }

  /** 获取带鉴权的请求头 */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `QQBot ${token}`,
      "X-Union-Appid": this.config.appId,
    };
  }

  /** 获取 WebSocket 网关地址 */
  async getGatewayUrl(): Promise<string> {
    const headers = await this.getAuthHeaders();
    // 先尝试 /gateway，再尝试 /gateway/bot
    try {
      const response = await this.client.get("/gateway", { headers });
      return response.data.url;
    } catch (error) {
      // 如果 /gateway 失败，尝试 /gateway/bot
      const response = await this.client.get("/gateway/bot", { headers });
      return response.data.url;
    }
  }

  /** 发送私聊消息 */
  async sendDirectMessage(
    openId: string,
    content: string,
    msgId?: string
  ): Promise<SendMessageResponse> {
    const headers = await this.getAuthHeaders();
    const data: Record<string, unknown> = {
      content,
      msg_type: 0,
    };

    if (msgId) {
      data.msg_id = msgId;
    }

    const response = await this.client.post(`/v2/users/${openId}/messages`, data, {
      headers,
    });

    logger.debug({ openId, messageId: response.data.id }, "Direct message sent");
    return response.data;
  }

  /** 发送群聊消息 */
  async sendGroupMessage(
    groupOpenId: string,
    content: string,
    msgId?: string
  ): Promise<SendMessageResponse> {
    const headers = await this.getAuthHeaders();
    const data: Record<string, unknown> = {
      content,
      msg_type: 0,
    };

    if (msgId) {
      data.msg_id = msgId;
    }

    const response = await this.client.post(`/v2/groups/${groupOpenId}/messages`, data, {
      headers,
    });

    logger.debug({ groupOpenId, messageId: response.data.id }, "Group message sent");
    return response.data;
  }

  /** 发送频道消息 */
  async sendChannelMessage(
    channelId: string,
    content: string,
    msgId?: string
  ): Promise<SendMessageResponse> {
    const headers = await this.getAuthHeaders();
    const data: Record<string, unknown> = {
      content,
      msg_type: 0,
    };

    // 如果有 msgId，作为被动消息发送
    if (msgId) {
      data.msg_id = msgId;
    }

    try {
      const response = await this.client.post(`/channels/${channelId}/messages`, data, {
        headers,
      });

      logger.debug({ channelId, messageId: response.data.id }, "Channel message sent");
      return response.data;
    } catch (error: unknown) {
      // 提取详细错误信息用于调试
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as { response?: { data?: unknown; status?: number } };
        logger.error({
          channelId,
          status: axiosError.response?.status,
          responseData: axiosError.response?.data,
          hasMsgId: !!msgId,
        }, "Channel message send failed");
      }
      throw error;
    }
  }

  /** 发送频道私信 */
  async sendDMMessage(
    guildId: string,
    content: string,
    msgId?: string
  ): Promise<SendMessageResponse> {
    const headers = await this.getAuthHeaders();
    const data: Record<string, unknown> = {
      content,
      msg_type: 0,
    };

    if (msgId) {
      data.msg_id = msgId;
    }

    const response = await this.client.post(`/dms/${guildId}/messages`, data, {
      headers,
    });

    logger.debug({ guildId, messageId: response.data.id }, "DM message sent");
    return response.data;
  }

  /** 获取用户信息 */
  async getUserInfo(openId: string): Promise<{ id: string; username: string }> {
    const headers = await this.getAuthHeaders();
    const response = await this.client.get(`/users/${openId}`, { headers });
    return response.data;
  }
}
