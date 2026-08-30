export function isAllowedNavigation(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "app:" && parsed.hostname === "fastmpa") ||
      (parsed.protocol === "http:" && parsed.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}
