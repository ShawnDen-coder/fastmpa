import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importLegacyDatabase } from "../src/main/migrations/legacy-database-migration.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("importLegacyDatabase", () => {
  it("backs up and copies without changing the legacy source", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-import-"));
    temporaryDirectories.push(directory);
    const legacyPath = join(directory, "legacy.sqlite");
    const databasePath = join(directory, "user-data.sqlite");
    await writeFile(legacyPath, "legacy database");

    const backupPath = importLegacyDatabase(legacyPath, databasePath);

    await expect(readFile(legacyPath, "utf8")).resolves.toBe("legacy database");
    await expect(readFile(backupPath, "utf8")).resolves.toBe("legacy database");
    await expect(readFile(databasePath, "utf8")).resolves.toBe(
      "legacy database",
    );
  });

  it("refuses to overwrite an existing destination", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-import-"));
    temporaryDirectories.push(directory);
    const legacyPath = join(directory, "legacy.sqlite");
    const databasePath = join(directory, "user-data.sqlite");
    await writeFile(legacyPath, "legacy database");
    await writeFile(databasePath, "current database");

    expect(() => importLegacyDatabase(legacyPath, databasePath)).toThrow(
      "Destination database already exists",
    );
  });
});
