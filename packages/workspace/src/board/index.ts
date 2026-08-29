export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  columnIds: readonly string[];
}

export interface Column {
  id: string;
  workspaceId: string;
  boardId: string;
  name: string;
  position: number;
}

export interface Card {
  id: string;
  workspaceId: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}
