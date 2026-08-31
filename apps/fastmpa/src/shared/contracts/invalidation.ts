export type SnapshotInvalidation =
  | { readonly scope: "shell" }
  | { readonly scope: "workspace"; readonly workspaceId: string }
  | {
      readonly scope: "conversation";
      readonly workspaceId: string;
      readonly conversationId: string;
    }
  | {
      readonly scope: "dispatch";
      readonly dispatchId: string;
      readonly workspaceId?: string;
    }
  | { readonly scope: "run"; readonly runId: string }
  | { readonly scope: "workspace-settings"; readonly workspaceId: string };
