import { randomUUID } from "node:crypto";
import type { WorkspaceRepository } from "workspace";
import type { ApplicationCommand, CommandResult } from "../application.js";

type WorkspaceCommand = Extract<
  ApplicationCommand,
  { type: "workspace.create" | "workspace.rename" }
>;

export async function handleWorkspaceCommand(
  repository: WorkspaceRepository,
  command: WorkspaceCommand,
  publish: () => Promise<void>,
  publishWorkspace: (workspaceId: string) => Promise<void>,
): Promise<CommandResult> {
  if (command.type === "workspace.create") {
    const id = command.workspaceId ?? randomUUID();
    if (repository.getWorkspace(id))
      throw new Error(`Workspace already exists: ${id}`);
    const now = new Date().toISOString();
    repository.saveWorkspace({
      id,
      name: command.name,
      createdAt: now,
      updatedAt: now,
    });
    await publish();
    return { created: true };
  }

  const workspace = repository.getWorkspace(command.workspaceId);
  if (!workspace)
    throw new Error(`Workspace not found: ${command.workspaceId}`);
  repository.saveWorkspace({
    ...workspace,
    name: command.name,
    updatedAt: new Date().toISOString(),
  });
  await publishWorkspace(command.workspaceId);
  return {};
}
