import { mkdir, writeFile, remove, exists } from "@tauri-apps/plugin-fs";
import { homeDir, join, tempDir } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Command } from "@tauri-apps/plugin-shell";
import { fetch } from "@tauri-apps/plugin-http";

const AIRI_VERSION = "0.9.0-alpha.14";
const BASE_URL = `https://github.com/moeru-ai/airi/releases/download/v${AIRI_VERSION}`;

const DOWNLOAD_URLS = {
  windows: `${BASE_URL}/AIRI-${AIRI_VERSION}-windows-x64-setup.exe`,
  linux_deb: `${BASE_URL}/AIRI-${AIRI_VERSION}-linux-amd64.deb`,
};

async function downloadFile(url: string, destPath: string, onProgress: (percent: number) => void): Promise<void> {
  const response = await fetch(url);
  const total = parseInt(response.headers.get("Content-Length") ?? "0");
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(Math.round((received / total) * 100));
  }

  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  await writeFile(destPath, buffer);
}

export async function createAppDirectory(): Promise<string> {
  const home = await homeDir();
  const os = platform();

  const path = os === "windows"
    ? await join(home, "AppData", "Roaming", "DarkLouis", "DarkAssistant")
    : await join(home, ".local", "share", "DarkLouis", "DarkAssistant");

  await mkdir(path, { recursive: true });
  return path;
}

export async function installAiri(appDir: string, setStatus: (msg: string) => void): Promise<void> {
  const os = platform();
  const airiDir = await join(appDir, "airi");
  const tmp = await tempDir();

  if (await exists(airiDir)) {
    setStatus("Suppression de l'ancienne installation...");
    await remove(airiDir, { recursive: true });
  }
  await mkdir(airiDir, { recursive: true });

  if (os === "windows") {
    const exePath = await join(tmp, "airi-setup.exe");
    await downloadFile(DOWNLOAD_URLS.windows, exePath, p => setStatus(`Téléchargement d'AIRI... ${p}%`));

    setStatus("Installation en cours...");
    await Command.create("cmd", ["/c", `"${exePath}" /S /D=${airiDir}`]).execute(); // execute installation wizaerd

    setStatus("Nettoyage en cours...");
    await remove(exePath);
  } else {
    const debPath = await join(tmp, "airi.deb");
    await downloadFile(DOWNLOAD_URLS.linux_deb, debPath, p => setStatus(`Téléchargement d'AIRI... ${p}%`));
    const workDir = await join(tmp, "airi_work");

    setStatus("Extraction en cours...");
    await Command.create("sh", ["-c", `mkdir -p "${workDir}"`]).execute(); // create working directory
    await Command.create("sh", ["-c", `cd "${workDir}" && ar x "${debPath}"`]).execute(); // extract .deb
    await Command.create("sh", ["-c", `tar xf "${workDir}"/data.tar.* -C "${airiDir}"`]).execute(); // extract app contents

    setStatus("Nettoyage en cours...");
    await Command.create("sh", ["-c", `rm -rf "${workDir}" "${debPath}"`]).execute(); // delete temporary files
  }

  setStatus("Installation terminée !");
}

export async function launchAiri(appDir: string): Promise<void> {
  const os = platform();
  const airiDir = await join(appDir, "airi");

  if (os === "windows") {
    const execPath = await join(airiDir, "AIRI.exe");
    await Command.create("cmd", ["/c", `start "" "${execPath}"`]).execute();
  } else {
    const execPath = await join(airiDir, "opt", "AIRI", "airi");
    await Command.create("sh", ["-c", `"${execPath}" &`]).execute();
  }
}
