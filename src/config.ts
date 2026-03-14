import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { createAppDirectory } from "./install";

export interface AppConfig {
  airiVersion: string;
}

const DEFAULT_CONFIG: AppConfig = {
  airiVersion: "",
};

export async function loadConfig(): Promise<AppConfig> {
  const appDir = await createAppDirectory();
  const path = await join(appDir, "config.json");
  if (!(await exists(path))) return { ...DEFAULT_CONFIG };
  return { ...DEFAULT_CONFIG, ...JSON.parse(await readTextFile(path)) };
}

export async function saveConfig(config: Partial<AppConfig>): Promise<void> {
  const appDir = await createAppDirectory();
  const path = await join(appDir, "config.json");
  const current = await loadConfig();
  await writeTextFile(path, JSON.stringify({ ...current, ...config }, null, 2));
}
