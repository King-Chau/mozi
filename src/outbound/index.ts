/**
 * 出站消息投递服务
 *
 * 提供统一的消息投递接口，支持向各通道主动发送消息
 * 参考 moltbot 的 outbound 模块实现
 */

import type { ChannelId, SendResult, OutboundMessage } from "../types/index.js";
import { getChannel, getAllChannels } from "../channels/common/index.js";
import { getChildLogger } from "../utils/logger.js";

const logger = getChildLogger("outbound");

/** 投递目标 */
export interface DeliveryTarget {
  /** 通道 ID */
  channel: ChannelId;
  /** 聊天 ID (用户/群组) */
  to: string;
  /** 账号 ID (可选，用于多账号场景) */
  accountId?: string;
}

/** 投递 Payload */
export interface DeliveryPayload {
  /** 文本内容 */
  text: string;
  /** 媒体 URL 列表 */
  mediaUrls?: string[];
  /** 回复消息 ID */
  replyToId?: string;
}

/** 投递选项 */
export interface DeliveryOptions {
  /** 是否尽力投递 (出错不抛异常) */
  bestEffort?: boolean;
  /** 超时时间 (毫秒) */
  timeoutMs?: number;
  /** 中止信号 */
  abortSignal?: AbortSignal;
}

/** 投递结果 */
export interface DeliveryResult {
  /** 是否成功 */
  success: boolean;
  /** 通道 ID */
  channel: ChannelId;
  /** 消息 ID */
  messageId?: string;
  /** 错误信息 */
  error?: string;
  /** 错误详情 */
  errorDetails?: unknown;
}

/**
 * 解析投递目标
 * 支持 "channel:chatId" 格式和 "last" 特殊值
 */
export function parseDeliveryTarget(
  target: string,
  fallbackChannel?: ChannelId
): DeliveryTarget | null {
  if (!target || target === "last") {
    // "last" 需要从会话历史中获取，这里返回 null 表示需要外部处理
    return null;
  }

  // 尝试解析 "channel:chatId" 格式
  const colonIndex = target.indexOf(":");
  if (colonIndex > 0) {
    const channel = target.slice(0, colonIndex) as ChannelId;
    const to = target.slice(colonIndex + 1);
    if (channel && to) {
      return { channel, to };
    }
  }

  // 如果有 fallback 通道，使用 target 作为 chatId
  if (fallbackChannel) {
    return { channel: fallbackChannel, to: target };
  }

  return null;
}

/**
 * 投递单条消息到指定通道
 */
export async function deliverMessage(
  target: DeliveryTarget,
  payload: DeliveryPayload,
  options?: DeliveryOptions
): Promise<DeliveryResult> {
  const { channel: channelId, to } = target;
  const { bestEffort = false } = options ?? {};

  logger.debug({ channelId, to, text: payload.text.slice(0, 100) }, "Delivering message");

  try {
    // 获取通道
    const channel = getChannel(channelId);
    if (!channel) {
      const error = `Channel not found: ${channelId}`;
      logger.warn({ channelId }, error);
      if (!bestEffort) {
        throw new Error(error);
      }
      return { success: false, channel: channelId, error };
    }

    // 构建出站消息
    const message: OutboundMessage = {
      chatId: to,
      content: payload.text,
      replyToId: payload.replyToId,
      mediaUrls: payload.mediaUrls,
    };

    // 发送消息
    const result = await channel.sendMessage(message);

    if (result.success) {
      logger.info({ channelId, to, messageId: result.messageId }, "Message delivered");
      return {
        success: true,
        channel: channelId,
        messageId: result.messageId,
      };
    } else {
      logger.warn({ channelId, to, error: result.error }, "Message delivery failed");
      if (!bestEffort) {
        throw new Error(result.error ?? "Unknown error");
      }
      return {
        success: false,
        channel: channelId,
        error: result.error,
      };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ channelId, to, error }, "Message delivery error");

    if (!bestEffort) {
      throw err;
    }

    return {
      success: false,
      channel: channelId,
      error,
      errorDetails: err,
    };
  }
}

/**
 * 投递多条消息 (批量)
 */
export async function deliverMessages(
  target: DeliveryTarget,
  payloads: DeliveryPayload[],
  options?: DeliveryOptions
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  for (const payload of payloads) {
    // 检查中止信号
    if (options?.abortSignal?.aborted) {
      results.push({
        success: false,
        channel: target.channel,
        error: "Aborted",
      });
      break;
    }

    try {
      // 总是使用 bestEffort 在内部调用，以便我们可以收集结果
      const result = await deliverMessage(target, payload, { ...options, bestEffort: true });
      results.push(result);

      // 如果不是 bestEffort 模式且失败，停止继续投递
      if (!result.success && !options?.bestEffort) {
        break;
      }
    } catch (err) {
      // 理论上这里不应该进入，因为我们使用了 bestEffort
      const error = err instanceof Error ? err.message : String(err);
      results.push({
        success: false,
        channel: target.channel,
        error,
        errorDetails: err,
      });
      if (!options?.bestEffort) {
        break;
      }
    }
  }

  return results;
}

/**
 * 统一投递接口 - 主入口
 * 参考 moltbot 的 deliverOutboundPayloads
 */
export async function deliverOutboundPayloads(params: {
  /** 通道 ID */
  channel: ChannelId;
  /** 目标 (聊天 ID) */
  to: string;
  /** 账号 ID (可选) */
  accountId?: string;
  /** 要投递的 Payload 列表 */
  payloads: DeliveryPayload[];
  /** 是否尽力投递 */
  bestEffort?: boolean;
  /** 中止信号 */
  abortSignal?: AbortSignal;
}): Promise<DeliveryResult[]> {
  const { channel, to, payloads, bestEffort = false, abortSignal } = params;

  if (!payloads.length) {
    return [];
  }

  const target: DeliveryTarget = { channel, to, accountId: params.accountId };

  return deliverMessages(target, payloads, { bestEffort, abortSignal });
}

/**
 * 发送文本消息的便捷方法
 */
export async function sendText(
  channel: ChannelId,
  to: string,
  text: string,
  options?: DeliveryOptions
): Promise<DeliveryResult> {
  return deliverMessage(
    { channel, to },
    { text },
    options
  );
}

/**
 * 获取所有可用的通道 ID
 */
export function getAvailableChannels(): ChannelId[] {
  return getAllChannels().map((ch) => ch.id);
}

/**
 * 检查通道是否可用
 */
export function isChannelAvailable(channelId: ChannelId): boolean {
  return getChannel(channelId) !== undefined;
}
