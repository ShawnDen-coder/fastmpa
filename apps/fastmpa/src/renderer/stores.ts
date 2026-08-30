import { create } from "zustand";

interface ShellState {
  readonly page: string;
  readonly setPage: (page: string) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  page: "Conversations",
  setPage: (page) => set({ page }),
}));
