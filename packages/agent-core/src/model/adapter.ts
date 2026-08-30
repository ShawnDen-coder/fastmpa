import type { ToolCall } from "../types/tool";
import type { CancellationSignal, ModelInput, TurnStatus } from "../types/turn";

/**
 * 模型适配器的统一返回值。
 *
 * Turn 只依赖这个协议，不关心底层使用的是 FakeModel、
 * OpenRouter 还是其他模型服务。
 */
export type ModelResponse =
  | {
      readonly type: "text";
      readonly content: string;
    }
  | {
      readonly type: "tool_calls";
      readonly content: string;
      readonly toolCalls: readonly ToolCall[];
    }
  | {
      readonly type: "status";
      readonly status: TurnStatus;
      readonly content?: string;
    };

/** Runtime control passed to a model request without polluting ModelInput. */
export interface ModelRequestOptions {
  readonly signal?: CancellationSignal;
}

/**
 * Agent Core 调用模型的最小接口。
 */
export interface ModelAdapter {
  complete(
    input: ModelInput,
    options?: ModelRequestOptions,
  ): Promise<ModelResponse>;
}

export type ModelStreamEvent =
  | { readonly type: "text.delta"; readonly delta: string }
  | { readonly type: "tool.call"; readonly call: ToolCall }
  | { readonly type: "completed"; readonly response: ModelResponse };

/** Optional incremental model protocol. Adapters may continue to implement only complete(). */
export interface StreamingModelAdapter extends ModelAdapter {
  stream(
    input: ModelInput,
    options?: ModelRequestOptions,
  ): AsyncIterable<ModelStreamEvent>;
}
