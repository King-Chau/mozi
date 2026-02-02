/**
 * 出站消息投递服务测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseDeliveryTarget,
  deliverMessage,
  deliverMessages,
  deliverOutboundPayloads,
  type DeliveryTarget,
  type DeliveryPayload,
} from "../src/outbound/index.js";

// Mock channels
vi.mock("../src/channels/common/index.js", () => {
  const mockChannel = {
    id: "dingtalk",
    sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: "msg-123" }),
  };

  return {
    getChannel: vi.fn((id: string) => {
      if (id === "dingtalk" || id === "feishu") {
        return { ...mockChannel, id };
      }
      return undefined;
    }),
    getAllChannels: vi.fn(() => [
      { id: "dingtalk" },
      { id: "feishu" },
    ]),
  };
});

import { getChannel } from "../src/channels/common/index.js";

describe("outbound/index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseDeliveryTarget", () => {
    it("should parse channel:chatId format", () => {
      const result = parseDeliveryTarget("dingtalk:user123");
      expect(result).toEqual({
        channel: "dingtalk",
        to: "user123",
      });
    });

    it("should parse with fallback channel", () => {
      const result = parseDeliveryTarget("user123", "feishu");
      expect(result).toEqual({
        channel: "feishu",
        to: "user123",
      });
    });

    it("should return null for 'last' without context", () => {
      const result = parseDeliveryTarget("last");
      expect(result).toBeNull();
    });

    it("should return null for empty target without fallback", () => {
      const result = parseDeliveryTarget("");
      expect(result).toBeNull();
    });

    it("should handle target with multiple colons", () => {
      const result = parseDeliveryTarget("dingtalk:group:abc:123");
      expect(result).toEqual({
        channel: "dingtalk",
        to: "group:abc:123",
      });
    });
  });

  describe("deliverMessage", () => {
    it("should deliver message successfully", async () => {
      const target: DeliveryTarget = { channel: "dingtalk", to: "user123" };
      const payload: DeliveryPayload = { text: "Hello" };

      const result = await deliverMessage(target, payload);

      expect(result.success).toBe(true);
      expect(result.channel).toBe("dingtalk");
      expect(result.messageId).toBe("msg-123");
    });

    it("should return error for unknown channel", async () => {
      const target: DeliveryTarget = { channel: "unknown" as any, to: "user123" };
      const payload: DeliveryPayload = { text: "Hello" };

      const result = await deliverMessage(target, payload, { bestEffort: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Channel not found");
    });

    it("should throw for unknown channel without bestEffort", async () => {
      const target: DeliveryTarget = { channel: "unknown" as any, to: "user123" };
      const payload: DeliveryPayload = { text: "Hello" };

      await expect(deliverMessage(target, payload)).rejects.toThrow("Channel not found");
    });

    it("should handle send failure with bestEffort", async () => {
      const mockGetChannel = getChannel as ReturnType<typeof vi.fn>;
      mockGetChannel.mockReturnValueOnce({
        id: "dingtalk",
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: "Network error" }),
      });

      const target: DeliveryTarget = { channel: "dingtalk", to: "user123" };
      const payload: DeliveryPayload = { text: "Hello" };

      const result = await deliverMessage(target, payload, { bestEffort: true });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("deliverMessages", () => {
    it("should deliver multiple messages", async () => {
      const target: DeliveryTarget = { channel: "dingtalk", to: "user123" };
      const payloads: DeliveryPayload[] = [
        { text: "Message 1" },
        { text: "Message 2" },
        { text: "Message 3" },
      ];

      const results = await deliverMessages(target, payloads);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it("should stop on first failure without bestEffort", async () => {
      const mockGetChannel = getChannel as ReturnType<typeof vi.fn>;
      let callCount = 0;
      mockGetChannel.mockImplementation(() => ({
        id: "dingtalk",
        sendMessage: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.resolve({ success: false, error: "Failed" });
          }
          return Promise.resolve({ success: true, messageId: `msg-${callCount}` });
        }),
      }));

      const target: DeliveryTarget = { channel: "dingtalk", to: "user123" };
      const payloads: DeliveryPayload[] = [
        { text: "Message 1" },
        { text: "Message 2" },
        { text: "Message 3" },
      ];

      const results = await deliverMessages(target, payloads);

      expect(results).toHaveLength(2);
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
    });

    it("should continue on failure with bestEffort", async () => {
      const mockGetChannel = getChannel as ReturnType<typeof vi.fn>;
      let callCount = 0;
      mockGetChannel.mockImplementation(() => ({
        id: "dingtalk",
        sendMessage: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.resolve({ success: false, error: "Failed" });
          }
          return Promise.resolve({ success: true, messageId: `msg-${callCount}` });
        }),
      }));

      const target: DeliveryTarget = { channel: "dingtalk", to: "user123" };
      const payloads: DeliveryPayload[] = [
        { text: "Message 1" },
        { text: "Message 2" },
        { text: "Message 3" },
      ];

      const results = await deliverMessages(target, payloads, { bestEffort: true });

      expect(results).toHaveLength(3);
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
      expect(results[2]?.success).toBe(true);
    });

    it("should respect abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      const target: DeliveryTarget = { channel: "dingtalk", to: "user123" };
      const payloads: DeliveryPayload[] = [
        { text: "Message 1" },
        { text: "Message 2" },
      ];

      const results = await deliverMessages(target, payloads, {
        abortSignal: controller.signal,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toBe("Aborted");
    });
  });

  describe("deliverOutboundPayloads", () => {
    it("should deliver payloads using unified interface", async () => {
      const results = await deliverOutboundPayloads({
        channel: "dingtalk",
        to: "user123",
        payloads: [{ text: "Hello" }],
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
    });

    it("should return empty array for empty payloads", async () => {
      const results = await deliverOutboundPayloads({
        channel: "dingtalk",
        to: "user123",
        payloads: [],
      });

      expect(results).toEqual([]);
    });
  });
});
