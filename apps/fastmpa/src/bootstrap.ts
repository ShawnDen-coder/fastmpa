import { FakeModel, type ToolRegistry } from "@shawnden-coder/agent-core";
import {
  createApplication,
  type FastMpaApplication,
  type FastMpaApplicationOptions,
} from "./application.js";
export function bootstrap(
  options: Omit<FastMpaApplicationOptions, "model"> & {
    model?: FastMpaApplicationOptions["model"];
    tools?: ToolRegistry;
  },
): Promise<FastMpaApplication> {
  return createApplication({
    ...options,
    model:
      options.model ??
      new FakeModel([{ type: "text", content: "演示 Agent 已完成任务。" }]),
  });
}
