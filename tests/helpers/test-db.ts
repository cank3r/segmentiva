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

  execFileSync("node", ["scripts/prisma-with-db.mjs", "migrate", "deploy"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  return { prisma, databaseUrl };
}

export async function insertOfflineSession(
  prisma: PrismaClient,
  shopDomain: string,
  id: string,
  accessToken = `token-${id}`,
) {
  await prisma.session.create({
    data: {
      id,
      shop: shopDomain,
      state: "offline",
      isOnline: false,
      accessToken,
      scope: "read_customers,write_customers",
    },
  });
}

export function uniqueShop(label: string): string {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `shop-${label}-${suffix}.myshopify.com`;
}

export const SHOP_A = "shop-a.myshopify.com";
export const SHOP_B = "shop-b.myshopify.com";
