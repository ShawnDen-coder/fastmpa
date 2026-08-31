import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";
import { Writable } from "node:stream";

export type { ApplicationLogEntry } from "../shared/contracts/logging.js";

import type { ApplicationLogEntry } from "../shared/contracts/logging.js";

export class ApplicationLogStore extends Writable {
  private readonly entries: ApplicationLogEntry[] = [];
  private readonly logListeners = new Set<
    (entry: ApplicationLogEntry) => void
  >();
  private readonly file: WriteStream;
  private pending = "";
  private sequence = 0;

  constructor(
    readonly filePath: string,
    private readonly capacity = 500,
  ) {
    super();
    mkdirSync(dirname(filePath), { recursive: true });
    this.file = createWriteStream(filePath, { flags: "a" });
  }

  getRecent(limit = 100): readonly ApplicationLogEntry[] {
    return this.entries.slice(Math.max(0, this.entries.length - limit));
  }

  subscribe(listener: (entry: ApplicationLogEntry) => void): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.end(() => {
        this.file.end(() => resolve());
      });
      this.once("error", reject);
      this.file.once("error", reject);
    });
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const text = chunk.toString();
    this.file.write(text);
    this.pending += text;
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    for (const line of lines) this.accept(line);
    callback();
  }

  private accept(line: string): void {
    if (!line.trim()) return;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    const level = record.level;
    if (
      level !== "debug" &&
      level !== "info" &&
      level !== "warn" &&
      level !== "error"
    )
      return;
    const context: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(record)) {
      if (
        !["time", "level", "component", "msg", "message"].includes(key) &&
        (typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean")
      )
        context[key] = value;
    }
    const entry: ApplicationLogEntry = {
      sequence: ++this.sequence,
      timestamp:
        typeof record.time === "string"
          ? record.time
          : new Date().toISOString(),
      level,
      component:
        typeof record.component === "string" ? record.component : "application",
      message:
        typeof record.msg === "string"
          ? record.msg
          : typeof record.message === "string"
            ? record.message
            : "",
      context,
    };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    for (const listener of this.logListeners) listener(entry);
  }
}
