export class EventBatcher<T> {
  private readonly pending: T[] = [];
  private pendingBytes = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly flushEvents: (events: readonly T[]) => void,
    private readonly maxBytes = 8 * 1024,
    private readonly maxDelayMs = 16,
    private readonly measure = (event: T): number =>
      JSON.stringify(event).length,
  ) {}

  push(event: T): void {
    this.pending.push(event);
    this.pendingBytes += this.measure(event);
    if (this.pendingBytes >= this.maxBytes) {
      this.flush();
      return;
    }
    if (this.timer === undefined)
      this.timer = setTimeout(() => this.flush(), this.maxDelayMs);
  }

  flush(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pending.length === 0) return;
    const events = this.pending.splice(0);
    this.pendingBytes = 0;
    this.flushEvents(events);
  }
}
