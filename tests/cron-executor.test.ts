/**
 * Cron 执行器测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCronExecutor, type AgentExecutor } from "../src/cron/executor.js";
import type { CronJob } from "../src/cron/types.js";

// Mock outbound
vi.mock("../src/outbound/index.js", () => ({
  deliverOutboundPayloads: vi.fn().mockResolvedValue([{ success: true, channel: "dingtalk", messageId: "msg-1" }]),
  isChannelAvailable: vi.fn((id: string) => id === "dingtalk" || id === "feishu"),
}));

import { deliverOutboundPayloads, isChannelAvailable } from "../src/outbound/index.js";

function createMockJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: "job-1",
    name: "Test Job",
    enabled: true,
    schedule: { kind: "every", everyMs: 60000 },
    payload: { kind: "systemEvent", message: "test message" },
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    state: {},
    ...overrides,
  };
}

describe("cron/executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeJob - systemEvent", () => {
    it("should execute systemEvent job successfully", async () => {
      const executor = createCronExecutor();

      const job = createMockJob({
        payload: { kind: "systemEvent", message: "hello" },
      });

      const result = await executor.executeJob(job);

      expect(result.status).toBe("ok");
      expect(result.summary).toBe("System event executed");
    });
  });

  describe("executeJob - agentTurn without executor", () => {
    it("should skip agentTurn without agent executor", async () => {
      const executor = createCronExecutor();

      const job = createMockJob({
        payload: {
          kind: "agentTurn",
          message: "What is the weather?",
          deliver: true,
          channel: "dingtalk",
          to: "user123",
        },
      });

      const result = await executor.executeJob(job);

      expect(result.status).toBe("skipped");
      expect(result.summary).toContain("No agent executor");
    });
  });

  describe("executeJob - agentTurn with executor", () => {
    it("should execute agentTurn and deliver result", async () => {
      const mockAgent: AgentExecutor = vi.fn().mockResolvedValue({
        success: true,
        output: "The weather is sunny today!",
      });

      const executor = createCronExecutor({
        agentExecutor: mockAgent,
      });

      const job = createMockJob({
        payload: {
          kind: "agentTurn",
          message: "What is the weather?",
          deliver: true,
          channel: "dingtalk",
          to: "user123",
        },
      });

      const result = await executor.executeJob(job);

      expect(result.status).toBe("ok");
      expect(result.outputText).toBe("The weather is sunny today!");

      // 验证 agent 被调用
      expect(mockAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "What is the weather?",
          sessionKey: "cron:job-1",
        })
      );

      // 验证消息被投递
      expect(deliverOutboundPayloads).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "dingtalk",
          to: "user123",
          payloads: [{ text: "The weather is sunny today!" }],
          bestEffort: true,
        })
      );
    });

    it("should not deliver when deliver is false", async () => {
      const mockAgent: AgentExecutor = vi.fn().mockResolvedValue({
        success: true,
        output: "Agent output",
      });

      const executor = createCronExecutor({
        agentExecutor: mockAgent,
      });

      const job = createMockJob({
        payload: {
          kind: "agentTurn",
          message: "Do something",
          deliver: false,
          channel: "dingtalk",
          to: "user123",
        },
      });

      const result = await executor.executeJob(job);

      expect(result.status).toBe("ok");
      expect(deliverOutboundPayloads).not.toHaveBeenCalled();
    });

    it("should not deliver when no target specified", async () => {
      const mockAgent: AgentExecutor = vi.fn().mockResolvedValue({
        success: true,
        output: "Agent output",
      });

      const executor = createCronExecutor({
        agentExecutor: mockAgent,
      });

      const job = createMockJob({
        payload: {
          kind: "agentTurn",
          message: "Do something",
          deliver: true,
          channel: "dingtalk",
          // no `to` field
        },
      });

      const result = await executor.executeJob(job);

      expect(result.status).toBe("ok");
      expect(deliverOutboundPayloads).not.toHaveBeenCalled();
    });

    it("should handle agent execution failure", async () => {
      const mockAgent: AgentExecutor = vi.fn().mockResolvedValue({
        success: false,
        output: "",
        error: "Model unavailable",
      });

      const executor = createCronExecutor({
        agentExecutor: mockAgent,
      });

      const job = createMockJob({
        payload: {
          kind: "agentTurn",
          message: "Do something",
          deliver: true,
          channel: "dingtalk",
          to: "user123",
        },
      });

      const result = await executor.executeJob(job);

      expect(result.status).toBe("error");
      expect(result.error).toBe("Model unavailable");
      // 不应投递
      expect(deliverOutboundPayloads).not.toHaveBeenCalled();
    });

    it("should handle agent throwing exception", async () => {
      const mockAgent: AgentExecutor = vi.fn().mockRejectedValue(new Error("Crash"));

      const executor = createCronExecutor({
        agentExecutor: mockAgent,
      });

      const job = createMockJob({
        payload: {
          kind: "agentTurn",
          message: "Do something",
          deliver: true,
          channel: "dingtalk",
          to: "user123",
        },
      });

      const result = await executor.executeJob(job);

      expect(result.status).toBe("error");
      expect(result.error).toBe("Crash");
    });

    it("should skip delivery for unavailable channel", async () => {
      const mockIsAvailable = isChannelAvailable as ReturnType<typeof vi.fn>;
      mockIsAvailable.mockReturnValue(false);

      const mockAgent: AgentExecutor = vi.fn().mockResolvedValue({
        success: true,
        output: "Result",
      });

      const executor = createCronExecutor({
        agentExecutor: mockAgent,
      });

      const job = createMockJob({
        payload: {
          kind: "agentTurn",
          message: "Do something",
          deliver: true,
          channel: "unknown_channel",
          to: "user123",
        },
      });

      const result = await executor.executeJob(job);

      expect(result.status).toBe("ok");
      expect(deliverOutboundPayloads).not.toHaveBeenCalled();
    });

    it("should use defaultChannel when channel is 'last'", async () => {
      // 重置 mock，确保 feishu 是可用的
      const mockIsAvailable = isChannelAvailable as ReturnType<typeof vi.fn>;
      mockIsAvailable.mockImplementation((id: string) => id === "dingtalk" || id === "feishu");

      const mockAgent: AgentExecutor = vi.fn().mockResolvedValue({
        success: true,
        output: "Result",
      });

      const executor = createCronExecutor({
        agentExecutor: mockAgent,
        defaultChannel: "feishu",
      });

      const job = createMockJob({
        payload: {
          kind: "agentTurn",
          message: "Do something",
          deliver: true,
          channel: "last",
          to: "user123",
        },
      });

      const result = await executor.executeJob(job);

      expect(result.status).toBe("ok");
      expect(deliverOutboundPayloads).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "feishu",
          to: "user123",
        })
      );
    });
  });

  describe("executeJob - unknown payload kind", () => {
    it("should return error for unknown payload kind", async () => {
      const executor = createCronExecutor();

      const job = createMockJob({
        payload: { kind: "unknown" as any, message: "test" },
      });

      const result = await executor.executeJob(job);

      expect(result.status).toBe("error");
      expect(result.error).toContain("Unknown payload kind");
    });
  });
});
