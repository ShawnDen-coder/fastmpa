import { copyFileSync, existsSync } from "node:fs";

export function importLegacyDatabase(
  legacyPath: string,
  databasePath: string,
): string {
  if (!existsSync(legacyPath)) throw new Error("Legacy database was not found");
  if (existsSync(databasePath))
    throw new Error("Destination database already exists");
  const backupPath = `${legacyPath}.backup-${Date.now()}`;
  copyFileSync(legacyPath, backupPath);
  copyFileSync(legacyPath, databasePath);
  return backupPath;
}
