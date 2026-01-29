/**
 * 企业微信事件处理
 * 处理回调消息和事件
 */

import type { InboundMessageContext, WeComConfig } from "../../types/index.js";
import { WeComCrypto } from "./crypto.js";
import { getChildLogger } from "../../utils/logger.js";

const logger = getChildLogger("wecom-events");

/** 企业微信回调消息 */
export interface WeComCallbackMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: string;
  Content?: string;
  MsgId?: string;
  AgentID?: number;
  Event?: string;
  EventKey?: string;
  ChatId?: string;
}

export class WeComEventHandler {
  private config: WeComConfig;
  private crypto: WeComCrypto | null = null;

  constructor(config: WeComConfig) {
    this.config = config;
    if (config.token && config.encodingAESKey) {
      this.crypto = new WeComCrypto(config.token, config.encodingAESKey, config.corpId);
    }
  }

  /** 验证回调 URL */
  verifyUrl(msgSignature: string, timestamp: string, nonce: string, echostr: string): string | null {
    if (!this.crypto) {
      logger.warn("Crypto not configured, skipping verification");
      return null;
    }

    if (!this.crypto.verifySignature(msgSignature, timestamp, nonce, echostr)) {
      logger.warn("Invalid signature for URL verification");
      return null;
    }

    return this.crypto.decryptEchoStr(echostr);
  }

  /** 解析回调消息 */
  parseMessage(
    msgSignature: string,
    timestamp: string,
    nonce: string,
    encryptedXml: string
  ): WeComCallbackMessage | null {
    if (!this.crypto) {
      logger.warn("Crypto not configured, cannot parse message");
      return null;
    }

    // 从 XML 中提取加密内容
    const encryptMatch = encryptedXml.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
    if (!encryptMatch) {
      logger.warn("No Encrypt field in XML");
      return null;
    }

    const encrypted = encryptMatch[1];
    if (!encrypted) {
      logger.warn("Empty Encrypt field in XML");
      return null;
    }

    // 验证签名
    if (!this.crypto.verifySignature(msgSignature, timestamp, nonce, encrypted)) {
      logger.warn("Invalid signature for message");
      return null;
    }

    // 解密消息
    const { message } = this.crypto.decrypt(encrypted);

    // 解析 XML
    return this.parseXml(message);
  }

  /** 解析 XML 为消息对象 */
  private parseXml(xml: string): WeComCallbackMessage {
    const getValue = (tag: string): string | undefined => {
      const match = xml.match(new RegExp(`<${tag}><!\[CDATA\[(.*?)\]\]><\/${tag}>`));
      if (match) return match[1];
      const numMatch = xml.match(new RegExp(`<${tag}>(\\d+)<\/${tag}>`));
      return numMatch ? numMatch[1] : undefined;
    };

    return {
      ToUserName: getValue("ToUserName") || "",
      FromUserName: getValue("FromUserName") || "",
      CreateTime: parseInt(getValue("CreateTime") || "0", 10),
      MsgType: getValue("MsgType") || "",
      Content: getValue("Content"),
      MsgId: getValue("MsgId"),
      AgentID: getValue("AgentID") ? parseInt(getValue("AgentID")!, 10) : undefined,
      Event: getValue("Event"),
      EventKey: getValue("EventKey"),
      ChatId: getValue("ChatId"),
    };
  }

  /** 转换为统一消息上下文 */
  convertToMessageContext(message: WeComCallbackMessage): InboundMessageContext | null {
    // 只处理文本消息
    if (message.MsgType !== "text") {
      logger.debug({ msgType: message.MsgType }, "Ignoring non-text message");
      return null;
    }

    if (!message.Content) {
      logger.debug("Empty content, ignoring");
      return null;
    }

    // 判断是私聊还是群聊
    const chatType = message.ChatId ? "group" : "direct";
    const chatId = message.ChatId || `direct:${message.FromUserName}`;

    return {
      channelId: "wecom",
      messageId: message.MsgId || `${message.CreateTime}`,
      chatId,
      chatType,
      senderId: message.FromUserName,
      senderName: undefined, // 需要额外调用 API 获取用户名
      content: message.Content,
      timestamp: message.CreateTime * 1000,
      raw: message,
    };
  }

  /** 生成回复消息 XML */
  generateReplyXml(
    toUser: string,
    fromUser: string,
    content: string,
    timestamp: number
  ): string {
    const xml = `<xml>
<ToUserName><![CDATA[${toUser}]]></ToUserName>
<FromUserName><![CDATA[${fromUser}]]></FromUserName>
<CreateTime>${timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content}]]></Content>
</xml>`;

    if (this.crypto) {
      const encrypted = this.crypto.encrypt(xml);
      const nonce = Math.random().toString(36).substring(2, 15);
      const signature = this.crypto.getSignature(String(timestamp), nonce, encrypted);

      return `<xml>
<Encrypt><![CDATA[${encrypted}]]></Encrypt>
<MsgSignature><![CDATA[${signature}]]></MsgSignature>
<TimeStamp>${timestamp}</TimeStamp>
<Nonce><![CDATA[${nonce}]]></Nonce>
</xml>`;
    }

    return xml;
  }
}
