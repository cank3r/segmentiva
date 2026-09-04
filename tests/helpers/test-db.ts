import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();

export function createMigratedTestDatabase(): {
  prisma: PrismaClient;
  databaseUrl: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "segmentiva-phase1-"));
  const databaseUrl = `file:${join(directory, "test.sqlite")}`;

  execFileSync(
    "npx",
    ["prisma", "migrate", "deploy"],
    {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    },
  );

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  return { prisma, databaseUrl };
}

export const SHOP_A = "shop-a.myshopify.com";
export const SHOP_B = "shop-b.myshopify.com";
