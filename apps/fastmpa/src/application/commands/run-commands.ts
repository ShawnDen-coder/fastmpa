import type {
  AgentRun,
  AgentRuntime,
  RuntimeTooling,
} from "@shawnden-coder/agent-runtime";
import type { ApplicationCommand, CommandResult } from "../application.js";

type RunCommand = Extract<
  ApplicationCommand,
  { type: "cancel" | "retry" | "approve" | "reject" }
>;

export async function handleRunCommand(
  worker: AgentRuntime,
  tooling: RuntimeTooling,
  command: RunCommand,
  getRun: (runId: string) => Promise<AgentRun | undefined>,
  publishResult: (result: CommandResult) => Promise<CommandResult>,
): Promise<CommandResult> {
  if (command.type === "cancel")
    return publishResult({ run: await worker.cancel(command.runId) });
  const run = await getRun(command.runId);
  if (command.type === "retry") {
    if (!run?.input) throw new Error("Run cannot be retried");
    return publishResult({ run: await worker.retry(command.runId) });
  }
  if (!run?.error?.details)
    throw new Error(
      `Approval ${command.approvalId} is not configured for Run ${command.runId}`,
    );
  const details = run.error.details as { approvalId?: unknown };
  if (details.approvalId !== command.approvalId)
    throw new Error("Approval does not belong to Run");
  if (command.type === "reject") {
    tooling.reject(command.approvalId, command.runId);
    return publishResult({ run: await worker.cancel(command.runId) });
  }
  const result = await tooling.approve(command.approvalId, command.runId);
  if (result.status !== "completed")
    throw new Error("Approval did not complete tool execution");
  if (!run.input) throw new Error("Waiting Run has no persisted input");
  return publishResult({
    run: await worker.resume(command.runId, {
      ...run.input.turn,
      messages: [
        ...(run.result?.messages ?? run.input.turn.messages),
        {
          role: "tool" as const,
          content: result.result.content,
          toolCallId: result.result.toolCallId,
        },
      ],
    }),
  });
}
