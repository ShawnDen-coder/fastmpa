import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeRunStore } from "./run-store.contract";
import { JsonFileRunStore } from "../src/index.js";

describeRunStore("JsonFileRunStore", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fastmpa-contract-"));
  return {
    store: new JsonFileRunStore(join(directory, "runtime.json")),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
});
