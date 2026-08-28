import { describeRunStore } from "./run-store.contract";
import { SqliteRunStore } from "../src/index.js";

describeRunStore("SqliteRunStore", async () => {
  const store = await SqliteRunStore.open({ filePath: ":memory:" });
  return { store, cleanup: async () => store.close() };
});
