import type { Board, Card, Column } from "./board.js";
import type { Conversation, Message, ReadCursor } from "./conversation.js";
import type { Participant } from "./participant.js";
import type { Schedule } from "./schedule.js";

export interface WorkspaceRepository {
  saveParticipant(participant: Participant): void;
  getParticipant(
    workspaceId: string,
    participantId: string,
  ): Participant | undefined;
  listParticipants(workspaceId: string): readonly Participant[];
  saveConversation(conversation: Conversation): void;
  getConversation(
    workspaceId: string,
    conversationId: string,
  ): Conversation | undefined;
  listConversations(workspaceId: string): readonly Conversation[];
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
  getSchedule(workspaceId: string, scheduleId: string): Schedule | undefined;
  listSchedules(workspaceId?: string): readonly Schedule[];
  listWorkspaceIds?(): readonly string[];
}

const key = (workspaceId: string, id: string) => `${workspaceId}:${id}`;

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly participants = new Map<string, Participant>();
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, Message[]>();
  private readonly boards = new Map<string, Board>();
  private readonly columns = new Map<string, Column>();
  private readonly cards = new Map<string, Card>();
  private readonly cursors = new Map<string, ReadCursor>();
  private readonly schedules = new Map<string, Schedule>();

  saveParticipant(participant: Participant): void {
    this.participants.set(
      key(participant.workspaceId, participant.id),
      participant,
    );
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
    return this.conversations.get(key(workspaceId, conversationId));
  }
  listConversations(workspaceId: string): readonly Conversation[] {
    return [...this.conversations.values()].filter(
      (item) => item.workspaceId === workspaceId,
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
    for (const value of this.participants.values()) ids.add(value.workspaceId);
    for (const value of this.conversations.values()) ids.add(value.workspaceId);
    for (const value of this.schedules.values()) ids.add(value.workspaceId);
    return [...ids].sort();
  }
}

export { SqliteWorkspaceRepository } from "./sqlite-repository.js";
