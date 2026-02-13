/**
 * 通道基类和接口
 */

import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  InboundMessageContext,
  OutboundMessage,
  SendResult,
} from "../../types/index.js";
import { getChildLogger } from "../../utils/logger.js";

/** 通道适配器接口 */
export interface ChannelAdapter {
  /** 通道 ID */
  id: ChannelId;

  /** 通道元数据 */
  meta: ChannelMeta;

  /** 初始化通道 */
  initialize(): Promise<void>;

  /** 关闭通道 */
  shutdown(): Promise<void>;

  /** 发送消息 */
  sendMessage(message: OutboundMessage): Promise<SendResult>;

  /** 发送文本消息 */
  sendText(chatId: string, text: string, replyToId?: string): Promise<SendResult>;

  /**
   * 根据入站消息上下文回复（由 Gateway 统一调用，通道可覆盖以实现会话级回复等）
   */
  replyToContext(context: InboundMessageContext, text: string): Promise<SendResult>;

  /** 检查通道状态 */
  isHealthy(): Promise<boolean>;
}

/** 消息处理器类型 */
export type MessageHandler = (context: InboundMessageContext) => Promise<void>;

/** 通道基类 */
export abstract class BaseChannelAdapter implements ChannelAdapter {
  abstract id: ChannelId;
  abstract meta: ChannelMeta;

  protected logger = getChildLogger("channel");
  protected messageHandler?: MessageHandler;

  /** 设置消息处理器 */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /** 处理入站消息 */
  protected async handleInboundMessage(context: InboundMessageContext): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(context);
    } else {
      this.logger.warn("No message handler registered");
    }
  }

  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;
  abstract sendMessage(message: OutboundMessage): Promise<SendResult>;
  abstract sendText(chatId: string, text: string, replyToId?: string): Promise<SendResult>;

  /** 默认实现：使用 chatId 与 messageId 调用 sendText */
  async replyToContext(context: InboundMessageContext, text: string): Promise<SendResult> {
    return this.sendText(context.chatId, text, context.messageId);
  }

  abstract isHealthy(): Promise<boolean>;
}
