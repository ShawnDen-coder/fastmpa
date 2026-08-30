import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileRunStore } from "../src/testing.js";
import { describeRunStore } from "./run-store.contract";

describeRunStore("JsonFileRunStore", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fastmpa-contract-"));
  return {
    store: new JsonFileRunStore(join(directory, "runtime.json")),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
});
