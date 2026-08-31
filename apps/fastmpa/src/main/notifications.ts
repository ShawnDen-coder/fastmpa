import type { AgentRun } from "@shawnden-coder/agent-runtime";
import { type BrowserWindow, Notification } from "electron";
import {
  desktopChannels,
  type NavigationIntent,
} from "../shared/desktop-api.js";

export interface NotificationPreferences {
  readonly notificationsEnabled: boolean;
}

export class DesktopNotificationController {
  private readonly sent = new Set<string>();

  public constructor(
    private readonly getWindow: () => BrowserWindow | undefined,
    private readonly getPreferences: (
      workspaceId: string,
    ) => NotificationPreferences | Promise<NotificationPreferences>,
  ) {}

  public async handleRun(run: AgentRun): Promise<void> {
    const window = this.getWindow();
    const workspaceId = run.context?.workspaceId;
    const conversationId = run.context?.conversationId;
    if (
      !window ||
      !workspaceId ||
      !conversationId ||
      !(await this.getPreferences(workspaceId)).notificationsEnabled
    )
      return;
    if (window.isFocused() && !window.isMinimized()) return;
    const approvalId = getApprovalId(run);
    const kind =
      approvalId && run.status === "waiting"
        ? "approval"
        : run.status === "completed" || run.status === "failed"
          ? run.status
          : undefined;
    if (!kind) return;
    const key = `${run.runId}:${kind}`;
    if (this.sent.has(key)) return;
    this.sent.add(key);
    const notification = new Notification({
      title:
        kind === "approval"
          ? "FastMPA 需要审批"
          : kind === "completed"
            ? "FastMPA 运行完成"
            : "FastMPA 运行失败",
      body:
        kind === "approval"
          ? "有工具调用等待你的决定"
          : kind === "completed"
            ? "对应 Agent 已完成运行"
            : (run.error?.message ?? "运行失败"),
    });
    notification.on("click", () => {
      window.restore();
      window.focus();
      const intent: NavigationIntent = {
        workspaceId,
        conversationId,
        runId: run.runId,
        ...(approvalId ? { approvalId } : {}),
      };
      window.webContents.send(desktopChannels.navigationRequested, intent);
    });
    notification.show();
  }
}

function getApprovalId(run: AgentRun): string | undefined {
  const details = run.error?.details;
  if (
    typeof details !== "object" ||
    details === null ||
    !("approvalId" in details)
  )
    return undefined;
  return typeof details.approvalId === "string"
    ? details.approvalId
    : undefined;
}
