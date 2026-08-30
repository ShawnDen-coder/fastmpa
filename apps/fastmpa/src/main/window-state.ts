export interface WindowState {
  readonly x?: number;
  readonly y?: number;
  readonly width: number;
  readonly height: number;
  readonly isMaximized: boolean;
}

export interface DisplayWorkArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const defaultWindowState: WindowState = {
  width: 1440,
  height: 900,
  isMaximized: false,
};

export function parseWindowState(serialized: string): WindowState {
  try {
    const parsed = JSON.parse(serialized) as Partial<WindowState>;
    if (typeof parsed.width !== "number" || typeof parsed.height !== "number")
      return defaultWindowState;
    return {
      ...defaultWindowState,
      ...parsed,
      isMaximized: parsed.isMaximized === true,
    };
  } catch {
    return defaultWindowState;
  }
}

export function isWindowStateVisible(
  state: WindowState,
  displays: readonly DisplayWorkArea[],
): boolean {
  const { x, y } = state;
  if (x === undefined || y === undefined) return false;
  return displays.some(
    (area) =>
      x < area.x + area.width &&
      x + state.width > area.x &&
      y < area.y + area.height &&
      y + state.height > area.y,
  );
}
