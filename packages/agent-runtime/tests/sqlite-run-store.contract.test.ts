import { SqliteRunStore } from "../src/index.js";
import { describeRunStore } from "./run-store.contract";

describeRunStore("SqliteRunStore", async () => {
  const store = await SqliteRunStore.open({ filePath: ":memory:" });
  return { store, cleanup: async () => store.close() };
});
