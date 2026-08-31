export interface ApplicationLogEntry {
  readonly sequence: number;
  readonly timestamp: string;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly component: string;
  readonly message: string;
  readonly context: Readonly<Record<string, string | number | boolean>>;
}
