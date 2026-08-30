import { MemoryRunStore } from "../src/testing.js";
import { describeRunStore } from "./run-store.contract";

describeRunStore("MemoryRunStore", async () => ({
  store: new MemoryRunStore(),
}));
