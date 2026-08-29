import type { AttentionSnapshot } from "workspace";

export function shouldWake(snapshot: AttentionSnapshot): boolean {
  return snapshot.inbox.length > 0 || snapshot.agenda.length > 0;
}
