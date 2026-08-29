import { InMemoryWorkspaceRepository, sendMessage } from "workspace"

const repository = new InMemoryWorkspaceRepository()
repository.saveParticipant({
  id: "user-1",
  workspaceId: "demo",
  kind: "human",
  name: "用户",
  status: "active",
})
repository.saveParticipant({
  id: "agent-1",
  workspaceId: "demo",
  kind: "agent",
  name: "TAPD Agent",
  status: "active",
})
repository.saveConversation({
  id: "conversation-1",
  workspaceId: "demo",
  participantIds: ["user-1", "agent-1"],
  createdAt: new Date().toISOString(),
})
const { message, change } = sendMessage(repository, {
  id: "message-1",
  workspaceId: "demo",
  conversationId: "conversation-1",
  senderId: "user-1",
  body: "检查 TAPD 项目 7A",
  mentions: ["agent-1"],
  createdAt: new Date().toISOString(),
})
console.log({ message, change })
