/**
 * 定时任务工具
 *
 * 提供创建、查询、管理定时任务的工具
 */

import { Type } from "@sinclair/typebox";
import type { Tool, ToolResult } from "../types.js";
import type { CronService } from "../../cron/service.js";
import type { CronSchedule, CronJobCreate, CronPayload } from "../../cron/types.js";
import { TIME_CONSTANTS } from "../../cron/types.js";
import { formatSchedule, validateCronExpr } from "../../cron/schedule.js";

/** Cron 工具选项 */
export interface CronToolsOptions {
  /** CronService 实例 */
  service: CronService;
}

/** 创建定时任务相关工具 */
export function createCronTools(options: CronToolsOptions): Tool[] {
  const { service } = options;

  return [
    createCronListTool(service),
    createCronAddTool(service),
    createCronRemoveTool(service),
    createCronRunTool(service),
    createCronUpdateTool(service),
  ];
}

/** 列出定时任务 */
function createCronListTool(service: CronService): Tool {
  return {
    name: "cron_list",
    label: "列出定时任务",
    description: "列出所有定时任务，包括已启用和已禁用的任务",
    parameters: Type.Object({
      includeDisabled: Type.Optional(Type.Boolean({
        description: "是否包含已禁用的任务，默认为 false",
      })),
    }),
    execute: async (_toolCallId, args): Promise<ToolResult> => {
      const { includeDisabled = false } = args as { includeDisabled?: boolean };

      const jobs = includeDisabled ? service.list({ includeDisabled: true }) : service.list();

      if (jobs.length === 0) {
        return {
          content: [{ type: "text", text: "没有定时任务" }],
        };
      }

      const lines = jobs.map((job) => {
        const status = job.enabled ? "✅" : "❌";
        const schedule = formatSchedule(job.schedule);
        const nextRun = job.state.nextRunAtMs
          ? new Date(job.state.nextRunAtMs).toLocaleString("zh-CN")
          : "无";
        const lastRun = job.state.lastRunAtMs
          ? new Date(job.state.lastRunAtMs).toLocaleString("zh-CN")
          : "从未执行";

        return `${status} **${job.name}** (ID: ${job.id})
   调度: ${schedule}
   下次执行: ${nextRun}
   上次执行: ${lastRun}
   执行次数: ${job.state.runCount ?? 0}`;
      });

      return {
        content: [{
          type: "text",
          text: `定时任务列表 (共 ${jobs.length} 个):\n\n${lines.join("\n\n")}`,
        }],
      };
    },
  };
}

/** 添加定时任务 */
function createCronAddTool(service: CronService): Tool {
  return {
    name: "cron_add",
    label: "添加定时任务",
    description: `添加一个新的定时任务。支持三种调度方式：
1. at - 一次性任务，在指定时间执行
2. every - 周期性任务，每隔指定时间执行
3. cron - Cron 表达式，支持 5 字段或 6 字段格式

支持两种任务类型：
- systemEvent: 简单的系统事件（默认）
- agentTurn: Agent 执行任务，可以执行 AI 对话并投递结果到指定通道`,
    parameters: Type.Object({
      name: Type.String({ description: "任务名称" }),
      scheduleType: Type.Union([
        Type.Literal("at"),
        Type.Literal("every"),
        Type.Literal("cron"),
      ], { description: "调度类型: at(一次性), every(周期性), cron(表达式)" }),
      // at 类型参数
      atTime: Type.Optional(Type.String({
        description: "一次性任务的执行时间，ISO 8601 格式，如 2024-01-01T10:00:00",
      })),
      // every 类型参数
      everyMs: Type.Optional(Type.Number({
        description: "周期性任务的间隔时间（毫秒）",
      })),
      everyUnit: Type.Optional(Type.Union([
        Type.Literal("seconds"),
        Type.Literal("minutes"),
        Type.Literal("hours"),
        Type.Literal("days"),
      ], { description: "周期性任务的时间单位" })),
      everyValue: Type.Optional(Type.Number({
        description: "周期性任务的时间值，与 everyUnit 配合使用",
      })),
      // cron 类型参数
      cronExpr: Type.Optional(Type.String({
        description: "Cron 表达式，如 '0 9 * * *' 表示每天 9 点",
      })),
      cronTz: Type.Optional(Type.String({
        description: "Cron 时区，如 'Asia/Shanghai'",
      })),
      // 通用参数
      message: Type.String({
        description: "任务触发时发送的消息内容",
      }),
      // agentTurn 任务参数
      payloadType: Type.Optional(Type.Union([
        Type.Literal("systemEvent"),
        Type.Literal("agentTurn"),
      ], { description: "任务类型: systemEvent(系统事件，默认), agentTurn(Agent执行)" })),
      deliver: Type.Optional(Type.Boolean({
        description: "是否投递 Agent 执行结果到通道 (仅 agentTurn 有效)",
      })),
      channel: Type.Optional(Type.String({
        description: "投递目标通道: dingtalk, feishu, qq, wecom (仅 agentTurn 有效)",
      })),
      to: Type.Optional(Type.String({
        description: "投递目标 ID，如用户 ID 或群组 ID (仅 agentTurn 有效)",
      })),
      model: Type.Optional(Type.String({
        description: "指定 Agent 使用的模型 (仅 agentTurn 有效)",
      })),
      timeoutSeconds: Type.Optional(Type.Number({
        description: "Agent 执行超时时间(秒) (仅 agentTurn 有效)",
      })),
    }),
    execute: async (_toolCallId, args): Promise<ToolResult> => {
      const {
        name,
        scheduleType,
        atTime,
        everyMs,
        everyUnit,
        everyValue,
        cronExpr,
        cronTz,
        message,
        payloadType = "systemEvent",
        deliver,
        channel,
        to,
        model,
        timeoutSeconds,
      } = args as {
        name: string;
        scheduleType: "at" | "every" | "cron";
        atTime?: string;
        everyMs?: number;
        everyUnit?: "seconds" | "minutes" | "hours" | "days";
        everyValue?: number;
        cronExpr?: string;
        cronTz?: string;
        message: string;
        payloadType?: "systemEvent" | "agentTurn";
        deliver?: boolean;
        channel?: string;
        to?: string;
        model?: string;
        timeoutSeconds?: number;
      };

      // 构建调度配置
      let schedule: CronSchedule;

      switch (scheduleType) {
        case "at": {
          if (!atTime) {
            return {
              content: [{ type: "text", text: "错误: at 类型任务需要提供 atTime 参数" }],
              isError: true,
            };
          }
          const atMs = new Date(atTime).getTime();
          if (isNaN(atMs)) {
            return {
              content: [{ type: "text", text: "错误: atTime 格式无效" }],
              isError: true,
            };
          }
          schedule = { kind: "at", atMs };
          break;
        }

        case "every": {
          let intervalMs = everyMs;
          if (!intervalMs && everyUnit && everyValue) {
            const unitMap: Record<string, number> = {
              seconds: TIME_CONSTANTS.SECOND,
              minutes: TIME_CONSTANTS.MINUTE,
              hours: TIME_CONSTANTS.HOUR,
              days: TIME_CONSTANTS.DAY,
            };
            intervalMs = everyValue * unitMap[everyUnit]!;
          }
          if (!intervalMs || intervalMs <= 0) {
            return {
              content: [{ type: "text", text: "错误: every 类型任务需要提供有效的间隔时间" }],
              isError: true,
            };
          }
          schedule = { kind: "every", everyMs: intervalMs };
          break;
        }

        case "cron": {
          if (!cronExpr) {
            return {
              content: [{ type: "text", text: "错误: cron 类型任务需要提供 cronExpr 参数" }],
              isError: true,
            };
          }
          const validation = validateCronExpr(cronExpr);
          if (!validation.valid) {
            return {
              content: [{ type: "text", text: `错误: Cron 表达式无效 - ${validation.error}` }],
              isError: true,
            };
          }
          schedule = { kind: "cron", expr: cronExpr, tz: cronTz };
          break;
        }
      }

      // 构建 payload
      let payload: CronPayload;

      if (payloadType === "agentTurn") {
        // agentTurn 任务需要 channel 和 to（如果 deliver 为 true）
        if (deliver && (!channel || !to)) {
          return {
            content: [{ type: "text", text: "错误: agentTurn 任务启用 deliver 时需要提供 channel 和 to 参数" }],
            isError: true,
          };
        }

        // 验证通道有效性
        const validChannels = ["dingtalk", "feishu", "qq", "wecom", "webchat", "last"];
        if (channel && !validChannels.includes(channel)) {
          return {
            content: [{ type: "text", text: `错误: 无效的通道 "${channel}"，支持: ${validChannels.join(", ")}` }],
            isError: true,
          };
        }

        // 验证超时时间范围
        if (timeoutSeconds !== undefined && (timeoutSeconds < 1 || timeoutSeconds > 600)) {
          return {
            content: [{ type: "text", text: "错误: timeoutSeconds 必须在 1-600 秒之间" }],
            isError: true,
          };
        }

        payload = {
          kind: "agentTurn",
          message,
          model,
          timeoutSeconds,
          deliver,
          channel,
          to,
        };
      } else {
        payload = { kind: "systemEvent", message };
      }

      // 创建任务
      const jobCreate: CronJobCreate = {
        name,
        schedule,
        payload,
      };

      const job = service.add(jobCreate);

      // 构建返回信息
      let resultText = `定时任务已创建:
- ID: ${job.id}
- 名称: ${job.name}
- 类型: ${payloadType === "agentTurn" ? "Agent 执行" : "系统事件"}
- 调度: ${formatSchedule(job.schedule)}
- 下次执行: ${job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toLocaleString("zh-CN") : "未计算"}`;

      if (payloadType === "agentTurn" && deliver) {
        resultText += `\n- 投递目标: ${channel} -> ${to}`;
      }

      return {
        content: [{
          type: "text",
          text: resultText,
        }],
      };
    },
  };
}

/** 删除定时任务 */
function createCronRemoveTool(service: CronService): Tool {
  return {
    name: "cron_remove",
    label: "删除定时任务",
    description: "根据 ID 删除一个定时任务",
    parameters: Type.Object({
      jobId: Type.String({ description: "要删除的任务 ID" }),
    }),
    execute: async (_toolCallId, args): Promise<ToolResult> => {
      const { jobId } = args as { jobId: string };

      const job = service.get(jobId);
      if (!job) {
        return {
          content: [{ type: "text", text: `错误: 找不到 ID 为 ${jobId} 的任务` }],
          isError: true,
        };
      }

      const removed = service.remove(jobId);
      if (!removed) {
        return {
          content: [{ type: "text", text: `错误: 删除任务失败` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `已删除定时任务: ${job.name} (ID: ${jobId})` }],
      };
    },
  };
}

/** 立即执行任务 */
function createCronRunTool(service: CronService): Tool {
  return {
    name: "cron_run",
    label: "立即执行任务",
    description: "立即执行一个定时任务（不影响原有调度）",
    parameters: Type.Object({
      jobId: Type.String({ description: "要执行的任务 ID" }),
    }),
    execute: async (_toolCallId, args): Promise<ToolResult> => {
      const { jobId } = args as { jobId: string };

      const result = await service.run(jobId);

      switch (result.status) {
        case "ok":
          return {
            content: [{ type: "text", text: `任务执行成功` }],
          };
        case "not_found":
          return {
            content: [{ type: "text", text: `错误: 找不到 ID 为 ${jobId} 的任务` }],
            isError: true,
          };
        case "error":
          return {
            content: [{ type: "text", text: `任务执行失败: ${result.error}` }],
            isError: true,
          };
        default:
          return {
            content: [{ type: "text", text: `未知状态: ${result.status}` }],
            isError: true,
          };
      }
    },
  };
}

/** 更新定时任务 */
function createCronUpdateTool(service: CronService): Tool {
  return {
    name: "cron_update",
    label: "更新定时任务",
    description: "更新定时任务的名称或启用状态",
    parameters: Type.Object({
      jobId: Type.String({ description: "要更新的任务 ID" }),
      name: Type.Optional(Type.String({ description: "新的任务名称" })),
      enabled: Type.Optional(Type.Boolean({ description: "是否启用任务" })),
    }),
    execute: async (_toolCallId, args): Promise<ToolResult> => {
      const { jobId, name, enabled } = args as {
        jobId: string;
        name?: string;
        enabled?: boolean;
      };

      const updates: { name?: string; enabled?: boolean } = {};
      if (name !== undefined) updates.name = name;
      if (enabled !== undefined) updates.enabled = enabled;

      if (Object.keys(updates).length === 0) {
        return {
          content: [{ type: "text", text: "错误: 没有提供要更新的字段" }],
          isError: true,
        };
      }

      const job = service.update(jobId, updates);

      if (!job) {
        return {
          content: [{ type: "text", text: `错误: 找不到 ID 为 ${jobId} 的任务` }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `定时任务已更新:
- ID: ${job.id}
- 名称: ${job.name}
- 状态: ${job.enabled ? "已启用" : "已禁用"}`,
        }],
      };
    },
  };
}
