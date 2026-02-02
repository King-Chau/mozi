/**
 * Cron 任务执行器
 *
 * 处理定时任务的执行，包括 Agent 调用和消息投递
 */

import type { CronJob, PayloadAgentTurn } from "./types.js";
import type { ChannelId } from "../types/index.js";
import { deliverOutboundPayloads, isChannelAvailable } from "../outbound/index.js";
import { getChildLogger } from "../utils/logger.js";

const logger = getChildLogger("cron-executor");

/** 任务执行结果 */
export interface CronExecutionResult {
  status: "ok" | "error" | "skipped";
  error?: string;
  summary?: string;
  /** Agent 输出的文本 */
  outputText?: string;
}

/** Agent 执行函数类型 */
export type AgentExecutor = (params: {
  message: string;
  sessionKey?: string;
  model?: string;
  timeoutSeconds?: number;
}) => Promise<{
  success: boolean;
  output: string;
  error?: string;
}>;

/** Cron 执行器选项 */
export interface CronExecutorOptions {
  /** Agent 执行函数 (可选，用于 agentTurn 任务) */
  agentExecutor?: AgentExecutor;
  /** 默认通道 (用于投递) */
  defaultChannel?: ChannelId;
}

/**
 * 创建 Cron 任务执行器
 */
export function createCronExecutor(options?: CronExecutorOptions) {
  const { agentExecutor, defaultChannel } = options ?? {};

  /**
   * 执行单个任务
   */
  async function executeJob(job: CronJob): Promise<CronExecutionResult> {
    const { payload } = job;

    logger.info({ jobId: job.id, jobName: job.name, payloadKind: payload.kind }, "Executing cron job");

    try {
      switch (payload.kind) {
        case "systemEvent":
          return executeSystemEvent(job);

        case "agentTurn":
          return executeAgentTurn(job, payload);

        default:
          return {
            status: "error",
            error: `Unknown payload kind: ${(payload as { kind: string }).kind}`,
          };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: job.id, error }, "Cron job execution failed");
      return { status: "error", error };
    }
  }

  /**
   * 执行系统事件任务
   */
  async function executeSystemEvent(job: CronJob): Promise<CronExecutionResult> {
    // systemEvent 只是记录日志，不需要执行任何操作
    logger.info(
      { jobId: job.id, message: job.payload.kind === "systemEvent" ? job.payload.message : "" },
      "System event triggered"
    );
    return { status: "ok", summary: "System event executed" };
  }

  /**
   * 执行 Agent 轮次任务
   */
  async function executeAgentTurn(
    job: CronJob,
    payload: PayloadAgentTurn
  ): Promise<CronExecutionResult> {
    const { message, model, timeoutSeconds, deliver, channel, to } = payload;

    // 如果没有 agentExecutor，只记录日志
    if (!agentExecutor) {
      logger.warn({ jobId: job.id }, "No agent executor configured, skipping agentTurn execution");
      return {
        status: "skipped",
        summary: "No agent executor configured",
      };
    }

    // 执行 Agent
    logger.info({ jobId: job.id, message: message.slice(0, 100) }, "Executing agent turn");

    let agentResult: Awaited<ReturnType<AgentExecutor>>;
    try {
      agentResult = await agentExecutor({
        message,
        sessionKey: `cron:${job.id}`,
        model,
        timeoutSeconds,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: job.id, error }, "Agent executor threw exception");
      return {
        status: "error",
        error,
      };
    }

    if (!agentResult.success) {
      return {
        status: "error",
        error: agentResult.error ?? "Agent execution failed",
        outputText: agentResult.output,
      };
    }

    const outputText = agentResult.output;

    // 如果需要投递
    if (deliver && to) {
      await deliverAgentOutput(job, payload, outputText);
    }

    return {
      status: "ok",
      summary: outputText.slice(0, 200),
      outputText,
    };
  }

  /**
   * 投递 Agent 输出
   */
  async function deliverAgentOutput(
    job: CronJob,
    payload: PayloadAgentTurn,
    outputText: string
  ): Promise<void> {
    const { channel: targetChannel, to } = payload;

    if (!to) {
      logger.warn({ jobId: job.id }, "No delivery target specified");
      return;
    }

    // 解析通道
    const channelId = resolveChannel(targetChannel);
    if (!channelId) {
      logger.warn({ jobId: job.id, targetChannel }, "Invalid or unavailable channel");
      return;
    }

    // 检查通道是否可用
    if (!isChannelAvailable(channelId)) {
      logger.warn({ jobId: job.id, channelId }, "Channel not available");
      return;
    }

    // 投递消息
    logger.info({ jobId: job.id, channelId, to }, "Delivering agent output");

    try {
      const results = await deliverOutboundPayloads({
        channel: channelId,
        to,
        payloads: [{ text: outputText }],
        bestEffort: true,
      });

      const successCount = results.filter((r) => r.success).length;
      logger.info(
        { jobId: job.id, channelId, to, successCount, totalCount: results.length },
        "Delivery completed"
      );
    } catch (err) {
      logger.error({ jobId: job.id, error: err }, "Delivery failed");
    }
  }

  /**
   * 解析通道 ID
   */
  function resolveChannel(channel?: string): ChannelId | null {
    if (!channel || channel === "last") {
      // "last" 表示使用默认通道或上次使用的通道
      return defaultChannel ?? null;
    }

    // 验证通道 ID
    const validChannels: ChannelId[] = ["dingtalk", "feishu", "qq", "wecom", "webchat"];
    if (validChannels.includes(channel as ChannelId)) {
      return channel as ChannelId;
    }

    return null;
  }

  return {
    executeJob,
    executeSystemEvent,
    executeAgentTurn,
  };
}

/**
 * 创建默认的 Cron 任务执行函数
 * 用于 getCronService 的 executeJob 参数
 */
export function createDefaultCronExecuteJob(options?: CronExecutorOptions) {
  const executor = createCronExecutor(options);
  return executor.executeJob;
}
