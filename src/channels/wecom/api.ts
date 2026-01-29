/**
 * 企业微信 API 客户端
 * 基于企业微信服务端 API
 */

import axios, { type AxiosInstance } from "axios";
import { getChildLogger } from "../../utils/logger.js";
import type { WeComConfig } from "../../types/index.js";

const logger = getChildLogger("wecom-api");

/** 企业微信 API 基础地址 */
const WECOM_API_BASE = "https://qyapi.weixin.qq.com/cgi-bin";

/** Access Token 缓存 */
interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

/** 发送消息响应 */
interface SendMessageResponse {
  errcode: number;
  errmsg: string;
  msgid?: string;
}

export class WeComApiClient {
  private config: WeComConfig;
  private client: AxiosInstance;
  private tokenCache: TokenCache | null = null;

  constructor(config: WeComConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: WECOM_API_BASE,
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
      const response = await this.client.get("/gettoken", {
        params: {
          corpid: this.config.corpId,
          corpsecret: this.config.corpSecret,
        },
      });

      const { access_token, expires_in, errcode, errmsg } = response.data;

      if (errcode && errcode !== 0) {
        throw new Error(`WeCom API error: ${errcode} - ${errmsg}`);
      }

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

  /** 发送应用消息 (文本) */
  async sendTextMessage(
    userId: string,
    content: string
  ): Promise<SendMessageResponse> {
    const token = await this.getAccessToken();

    const data = {
      touser: userId,
      msgtype: "text",
      agentid: this.config.agentId,
      text: {
        content,
      },
    };

    const response = await this.client.post(`/message/send?access_token=${token}`, data);

    if (response.data.errcode !== 0) {
      throw new Error(`WeCom send error: ${response.data.errcode} - ${response.data.errmsg}`);
    }

    logger.debug({ userId, msgid: response.data.msgid }, "Text message sent");
    return response.data;
  }

  /** 发送群聊消息 */
  async sendGroupTextMessage(
    chatId: string,
    content: string
  ): Promise<SendMessageResponse> {
    const token = await this.getAccessToken();

    const data = {
      chatid: chatId,
      msgtype: "text",
      text: {
        content,
      },
    };

    const response = await this.client.post(`/appchat/send?access_token=${token}`, data);

    if (response.data.errcode !== 0) {
      throw new Error(`WeCom group send error: ${response.data.errcode} - ${response.data.errmsg}`);
    }

    logger.debug({ chatId }, "Group text message sent");
    return response.data;
  }

  /** 获取用户信息 */
  async getUserInfo(userId: string): Promise<{ name: string; userid: string }> {
    const token = await this.getAccessToken();

    const response = await this.client.get(`/user/get?access_token=${token}&userid=${userId}`);

    if (response.data.errcode !== 0) {
      throw new Error(`WeCom get user error: ${response.data.errcode} - ${response.data.errmsg}`);
    }

    return response.data;
  }
}
