import { describe, expect, it } from "vitest";

import {
  ToolExecutionError,
  ToolExecutor,
  ToolRegistry,
  TurnContext,
} from "../src/index";

function createEchoTool() {
  return {
    definition: {
      name: "echo",
      description: "返回输入内容",
      parameters: {
        type: "object",
        properties: {
          value: { type: "string" },
        },
        required: ["value"],
      },
    },
    validate(args: unknown) {
      if (!args || typeof args !== "object" || !("value" in args)) {
        throw new Error("value is required");
      }
    },
    execute(args: { value: string }) {
      return args.value;
    },
  };
}

describe("ToolRegistry", () => {
  it("注册工具并只暴露工具定义", () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());

    expect(registry.get("echo")?.definition.name).toBe("echo");
    expect(registry.definitions()).toEqual([createEchoTool().definition]);
    expect("execute" in registry.definitions()[0]).toBe(false);
  });

  it("拒绝空名称和重复工具", () => {
    const registry = new ToolRegistry();

    expect(() =>
      registry.register({
        definition: {
          name: " ",
          description: "invalid",
          parameters: {},
        },
        execute: () => null,
      }),
    ).toThrow("Tool name is required");

    expect(() =>
      registry.register({
        definition: { name: " echo ", description: "invalid", parameters: {} },
        validate() {},
        execute() {},
      }),
    ).toThrow("Tool name must not have leading or trailing whitespace");

    expect(() =>
      registry.register({
        definition: {
          name: "missing-validator",
          description: "invalid",
          parameters: {},
        },
        execute() {},
      } as never),
    ).toThrow("Tool validator is required: missing-validator");

    registry.register(createEchoTool());

    expect(() => registry.register(createEchoTool())).toThrow(
      "Tool already registered: echo",
    );
  });
});

describe("ToolExecutor", () => {
  it("执行成功并序列化结果", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());

    const result = await new ToolExecutor(registry).execute({
      id: "call-1",
      name: "echo",
      arguments: JSON.stringify({ value: "hello" }),
    });

    expect(result).toEqual({
      ok: true,
      toolCallId: "call-1",
      name: "echo",
      content: "hello",
    });
  });

  it("将未知工具转换为结构化错误", async () => {
    const result = await new ToolExecutor(new ToolRegistry()).execute({
      id: "call-unknown",
      name: "missing",
      arguments: "{}",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("tool_not_found");
      expect(result.error.retryable).toBe(false);
    }
  });

  it("将非法 JSON 转换为结构化错误", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());

    const result = await new ToolExecutor(registry).execute({
      id: "call-json",
      name: "echo",
      arguments: "{invalid",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_json");
    }
  });

  it("将参数校验失败转换为结构化错误", async () => {
    const registry = new ToolRegistry();
    registry.register(createEchoTool());

    const result = await new ToolExecutor(registry).execute({
      id: "call-args",
      name: "echo",
      arguments: "{}",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_arguments");
      expect(result.error.message).toBe("value is required");
    }
  });

  it("保留 ToolExecutionError 的错误码和可重试属性", async () => {
    const registry = new ToolRegistry();
    registry.register({
      definition: {
        name: "remote",
        description: "模拟远程工具",
        parameters: {},
      },
      validate() {},
      execute() {
        throw new ToolExecutionError("timeout", "远程服务超时", true);
      },
    });

    const result = await new ToolExecutor(registry).execute({
      id: "call-timeout",
      name: "remote",
      arguments: "{}",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("timeout");
      expect(result.error.retryable).toBe(true);
    }
  });

  it("将普通执行异常转换为 execution_failed", async () => {
    const registry = new ToolRegistry();
    registry.register({
      definition: {
        name: "broken",
        description: "模拟失败工具",
        parameters: {},
      },
      validate() {},
      execute() {
        throw new Error("unexpected failure");
      },
    });

    const result = await new ToolExecutor(registry).execute({
      id: "call-broken",
      name: "broken",
      arguments: "{}",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("execution_failed");
      expect(result.error.message).toBe("unexpected failure");
    }
  });
});

describe("TurnContext", () => {
  it("保持消息顺序并格式化工具错误", () => {
    const context = new TurnContext();
    context.addUserMessage("检查需求");
    context.addAssistantMessage("", [
      {
        id: "call-1",
        name: "echo",
        arguments: "{}",
      },
    ]);
    context.addToolResult({
      ok: false,
      toolCallId: "call-1",
      name: "echo",
      content: "value is required",
      error: {
        code: "invalid_arguments",
        message: "value is required",
        retryable: false,
      },
    });

    expect(context.messages).toHaveLength(3);
    expect(context.messages[2].role).toBe("tool");
    expect(context.messages[2].content).toBe(
      "[tool_error:invalid_arguments] value is required",
    );
  });
});
