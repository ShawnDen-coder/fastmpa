export type SnapshotInvalidation =
  | { readonly scope: "shell" }
  | {
      readonly scope: "conversation";
      readonly workspaceId: string;
      readonly conversationId: string;
    }
  | { readonly scope: "dispatch"; readonly dispatchId: string }
  | { readonly scope: "run"; readonly runId: string };
