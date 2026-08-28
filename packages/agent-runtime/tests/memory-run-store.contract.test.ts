import { MemoryRunStore } from "../src/index.js";
import { describeRunStore } from "./run-store.contract";

describeRunStore("MemoryRunStore", async () => ({
  store: new MemoryRunStore(),
}));
