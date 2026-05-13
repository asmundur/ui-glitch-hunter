import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function emptyDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
  await ensureDir(dir);
}

export function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function frameFileName(index: number, extension: string): string {
  return `${String(index + 1).padStart(6, "0")}.${extension}`;
}

export function relativeDisplayPath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || filePath;
}
