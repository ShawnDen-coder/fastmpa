import { describeRunStore } from "./run-store.contract";
import { MemoryRunStore } from "../src/index.js";

describeRunStore("MemoryRunStore", async () => ({ store: new MemoryRunStore() }));
