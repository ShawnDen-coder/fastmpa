import { randomUUID } from "node:crypto";
import type { Board, Card, Column } from "./board.js";
import {
  type Conversation,
  type Message,
  normalizeConversation,
  type ReadCursor,
} from "./conversation.js";
import type { ConversationDispatch } from "./dispatch.js";
import type { AgentInput, AgentPatch, Participant } from "./participant.js";
import { normalizeParticipantName } from "./participant.js";
import type { Schedule } from "./schedule.js";
import type { Workspace } from "./workspace.js";

export interface WorkspaceRepository {
  saveWorkspace(workspace: Workspace): void;
  getWorkspace(workspaceId: string): Workspace | undefined;
  listWorkspaces(): readonly Workspace[];
  saveParticipant(participant: Participant): void;
  getParticipant(
    workspaceId: string,
    participantId: string,
  ): Participant | undefined;
  listParticipants(workspaceId: string): readonly Participant[];
  findAgentByName(workspaceId: string, name: string): Participant | undefined;
  createAgent(workspaceId: string, input: AgentInput): Participant;
  updateAgent(
    workspaceId: string,
    agentId: string,
    patch: AgentPatch,
  ): Participant;
  setAgentStatus(
    workspaceId: string,
    agentId: string,
    status: "active" | "inactive",
  ): Participant;
  saveConversation(conversation: Conversation): void;
  getConversation(
    workspaceId: string,
    conversationId: string,
  ): Conversation | undefined;
  listConversations(workspaceId: string): readonly Conversation[];
  findDirectConversation(
    workspaceId: string,
    agentId: string,
  ): Conversation | undefined;
  saveDispatch(dispatch: ConversationDispatch): void;
  getDispatch(
    workspaceId: string,
    dispatchId: string,
  ): ConversationDispatch | undefined;
  listDispatches(workspaceId?: string): readonly ConversationDispatch[];
  saveMessage(message: Message): void;
  listMessages(workspaceId: string, conversationId: string): readonly Message[];
  saveBoard(board: Board): void;
  saveColumn(column: Column): void;
  saveCard(card: Card): void;
  getCard(workspaceId: string, cardId: string): Card | undefined;
  listCards(workspaceId: string, boardId?: string): readonly Card[];
  getReadCursor(
    workspaceId: string,
    agentId: string,
    conversationId: string,
  ): ReadCursor;
  saveReadCursor(cursor: ReadCursor): void;
  saveSchedule(schedule: Schedule): void;
  deleteSchedule(workspaceId: string, scheduleId: string): void;
  getSchedule(workspaceId: string, scheduleId: string): Schedule | undefined;
  listSchedules(workspaceId?: string): readonly Schedule[];
  listWorkspaceIds?(): readonly string[];
}

const key = (workspaceId: string, id: string) => `${workspaceId}:${id}`;

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly workspaces = new Map<string, Workspace>();
  private readonly participants = new Map<string, Participant>();
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, Message[]>();
  private readonly dispatches = new Map<string, ConversationDispatch>();
  private readonly boards = new Map<string, Board>();
  private readonly columns = new Map<string, Column>();
  private readonly cards = new Map<string, Card>();
  private readonly cursors = new Map<string, ReadCursor>();
  private readonly schedules = new Map<string, Schedule>();

  saveWorkspace(workspace: Workspace): void {
    this.workspaces.set(workspace.id, workspace);
  }
  getWorkspace(workspaceId: string): Workspace | undefined {
    return this.workspaces.get(workspaceId);
  }
  listWorkspaces(): readonly Workspace[] {
    return [...this.workspaces.values()].sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
  }

  saveParticipant(participant: Participant): void {
    this.participants.set(
      key(participant.workspaceId, participant.id),
      participant,
    );
  }
  findAgentByName(workspaceId: string, name: string): Participant | undefined {
    const normalized = normalizeParticipantName(name);
    return this.listParticipants(workspaceId).find(
      (participant) =>
        participant.kind === "agent" &&
        normalizeParticipantName(participant.name) === normalized,
    );
  }
  createAgent(workspaceId: string, input: AgentInput): Participant {
    if (this.findAgentByName(workspaceId, input.name))
      throw new Error(`Agent name already exists: ${input.name.trim()}`);
    const participant: Participant = {
      id: input.id ?? randomId(),
      workspaceId,
      kind: "agent",
      name: input.name.trim(),
      status: "active",
      agent: {
        modelKey: input.modelKey,
        persona: input.persona,
        role: input.role,
        capabilities: [...input.capabilities],
        toolNames: [...input.toolNames],
      },
    };
    this.saveParticipant(participant);
    return participant;
  }
  updateAgent(
    workspaceId: string,
    agentId: string,
    patch: AgentPatch,
  ): Participant {
    const current = requireAgent(this, workspaceId, agentId);
    if (
      patch.name &&
      normalizeParticipantName(patch.name) !==
        normalizeParticipantName(current.name) &&
      this.findAgentByName(workspaceId, patch.name)
    )
      throw new Error(`Agent name already exists: ${patch.name.trim()}`);
    const { name: _name, ...profilePatch } = patch;
    const updated = {
      ...current,
      ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
      agent: { ...current.agent, ...profilePatch },
    } as Participant;
    this.saveParticipant(updated);
    return updated;
  }
  setAgentStatus(
    workspaceId: string,
    agentId: string,
    status: "active" | "inactive",
  ): Participant {
    const current = requireAgent(this, workspaceId, agentId);
    const updated = { ...current, status };
    this.saveParticipant(updated);
    return updated;
  }
  getParticipant(
    workspaceId: string,
    participantId: string,
  ): Participant | undefined {
    return this.participants.get(key(workspaceId, participantId));
  }
  listParticipants(workspaceId: string): readonly Participant[] {
    return [...this.participants.values()].filter(
      (item) => item.workspaceId === workspaceId,
    );
  }
  saveConversation(conversation: Conversation): void {
    this.conversations.set(
      key(conversation.workspaceId, conversation.id),
      conversation,
    );
  }
  getConversation(
    workspaceId: string,
    conversationId: string,
  ): Conversation | undefined {
    const conversation = this.conversations.get(
      key(workspaceId, conversationId),
    );
    return conversation ? normalizeConversation(conversation) : undefined;
  }
  listConversations(workspaceId: string): readonly Conversation[] {
    return [...this.conversations.values()]
      .filter((item) => item.workspaceId === workspaceId)
      .map(normalizeConversation);
  }
  findDirectConversation(
    workspaceId: string,
    agentId: string,
  ): Conversation | undefined {
    return this.listConversations(workspaceId).find(
      (conversation) =>
        (conversation.kind ?? "group") === "direct" &&
        conversation.participantIds.length === 2 &&
        conversation.participantIds.includes(agentId) &&
        conversation.participantIds.includes("human"),
    );
  }
  saveDispatch(dispatch: ConversationDispatch): void {
    this.dispatches.set(key(dispatch.workspaceId, dispatch.id), dispatch);
  }
  getDispatch(
    workspaceId: string,
    dispatchId: string,
  ): ConversationDispatch | undefined {
    return this.dispatches.get(key(workspaceId, dispatchId));
  }
  listDispatches(workspaceId?: string): readonly ConversationDispatch[] {
    return [...this.dispatches.values()]
      .filter(
        (dispatch) => !workspaceId || dispatch.workspaceId === workspaceId,
      )
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      );
  }
  saveMessage(message: Message): void {
    const messages =
      this.messages.get(key(message.workspaceId, message.conversationId)) ?? [];
    messages.push(message);
    messages.sort(
      (left, right) =>
        left.sequence - right.sequence || left.id.localeCompare(right.id),
    );
    this.messages.set(
      key(message.workspaceId, message.conversationId),
      messages,
    );
  }
  listMessages(
    workspaceId: string,
    conversationId: string,
  ): readonly Message[] {
    return [...(this.messages.get(key(workspaceId, conversationId)) ?? [])];
  }
  saveBoard(board: Board): void {
    this.boards.set(key(board.workspaceId, board.id), board);
  }
  saveColumn(column: Column): void {
    this.columns.set(key(column.workspaceId, column.id), column);
  }
  saveCard(card: Card): void {
    this.cards.set(key(card.workspaceId, card.id), card);
  }
  getCard(workspaceId: string, cardId: string): Card | undefined {
    return this.cards.get(key(workspaceId, cardId));
  }
  listCards(workspaceId: string, boardId?: string): readonly Card[] {
    return [...this.cards.values()]
      .filter(
        (item) =>
          item.workspaceId === workspaceId &&
          (!boardId || item.boardId === boardId),
      )
      .sort(
        (left, right) =>
          left.position - right.position || left.id.localeCompare(right.id),
      );
  }
  getReadCursor(
    workspaceId: string,
    agentId: string,
    conversationId: string,
  ): ReadCursor {
    return (
      this.cursors.get(key(`${workspaceId}:${agentId}`, conversationId)) ?? {
        workspaceId,
        agentId,
        conversationId,
        lastSequence: 0,
      }
    );
  }
  saveReadCursor(cursor: ReadCursor): void {
    this.cursors.set(
      key(`${cursor.workspaceId}:${cursor.agentId}`, cursor.conversationId),
      cursor,
    );
  }
  saveSchedule(schedule: Schedule): void {
    this.schedules.set(key(schedule.workspaceId, schedule.id), schedule);
  }
  deleteSchedule(workspaceId: string, scheduleId: string): void {
    this.schedules.delete(key(workspaceId, scheduleId));
  }
  getSchedule(workspaceId: string, scheduleId: string): Schedule | undefined {
    return this.schedules.get(key(workspaceId, scheduleId));
  }
  listSchedules(workspaceId?: string): readonly Schedule[] {
    return [...this.schedules.values()]
      .filter(
        (schedule) => !workspaceId || schedule.workspaceId === workspaceId,
      )
      .sort(
        (left, right) =>
          left.nextRunAt - right.nextRunAt || left.id.localeCompare(right.id),
      );
  }
  listWorkspaceIds(): readonly string[] {
    const ids = new Set<string>();
    for (const value of this.workspaces.values()) ids.add(value.id);
    for (const value of this.participants.values()) ids.add(value.workspaceId);
    for (const value of this.conversations.values()) ids.add(value.workspaceId);
    for (const value of this.dispatches.values()) ids.add(value.workspaceId);
    for (const value of this.schedules.values()) ids.add(value.workspaceId);
    return [...ids].sort();
  }
}

function randomId(): string {
  return randomUUID();
}

function requireAgent(
  repository: WorkspaceRepository,
  workspaceId: string,
  agentId: string,
): Participant {
  const participant = repository.getParticipant(workspaceId, agentId);
  if (participant?.kind !== "agent")
    throw new Error(`Agent not found: ${agentId}`);
  if (!participant.agent)
    throw new Error(`Agent profile is missing: ${agentId}`);
  return participant;
}

export { SqliteWorkspaceRepository } from "./sqlite-repository.js";
