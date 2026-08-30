export function isAllowedNavigation(url: string): boolean {
  return url.startsWith("app://fastmpa/") || url.startsWith("http://localhost:");
}

export function isAllowedExternalUrl(url: string): boolean {
  return url.startsWith("https://");
}
