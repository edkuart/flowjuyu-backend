import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const loadedEnvFiles: string[] = [];

function loadEnvFile(filePath: string, override: boolean): void {
  if (!fs.existsSync(filePath)) return;

  dotenv.config({ path: filePath, override });
  loadedEnvFiles.push(path.basename(filePath));
}

// Base env is always loaded first so local/dev files can safely override it.
loadEnvFile(path.resolve(process.cwd(), ".env"), false);

if (process.env.NODE_ENV !== "production") {
  const localEnvFile = process.env.APP_ENV_FILE?.trim() || ".env.local";
  loadEnvFile(path.resolve(process.cwd(), localEnvFile), true);
}

export function getLoadedEnvFiles(): string[] {
  return [...loadedEnvFiles];
}
