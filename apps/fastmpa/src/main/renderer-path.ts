import { resolve, sep } from "node:path";

export function resolveRendererPath(
  rendererRoot: string,
  pathname: string,
): string | undefined {
  let requestedPath: string;
  try {
    requestedPath = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  } catch {
    return undefined;
  }
  const filePath = resolve(rendererRoot, requestedPath);
  if (filePath !== rendererRoot && !filePath.startsWith(`${rendererRoot}${sep}`))
    return undefined;
  return filePath;
}
