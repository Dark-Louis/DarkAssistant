import { mkdir, remove, exists } from "@tauri-apps/plugin-fs";
import { homeDir, join, tempDir } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { Command } from "@tauri-apps/plugin-shell";

const AIRI_VERSION = "0.9.0-alpha.14";
const AIRI_EXEC_HASHES: Record<string, string> = {
  linux: "84be5d125380d744d76efb166e82ccc56cc5392512ff8d8530c117d72e89d76e",
  windows: "", // TODO: replace via API call
};
const BASE_URL = `https://github.com/moeru-ai/airi/releases/download/v${AIRI_VERSION}`;

const DOWNLOAD_URLS = {
  windows: `${BASE_URL}/AIRI-${AIRI_VERSION}-windows-x64-setup.exe`,
  linux_deb: `${BASE_URL}/AIRI-${AIRI_VERSION}-linux-amd64.deb`,
};

function sh(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = Command.create("sh", ["-c", script]);
    cmd.on("close", ({ code }) => code === 0 ? resolve() : reject(new Error(`sh exited with code ${code}`)));
    cmd.on("error", reject);
    cmd.spawn().catch(reject);
  });
}

function shOutput(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const cmd = Command.create("sh", ["-c", script]);
    cmd.stdout.on("data", (data: string) => { output += data; });
    cmd.on("close", ({ code }) => code === 0 ? resolve(output.trim()) : reject(new Error(`sh exited with code ${code}`)));
    cmd.on("error", reject);
    cmd.spawn().catch(reject);
  });
}

async function downloadFile(url: string, destPath: string, onProgress: (percent: number) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cmd = Command.create("sh", ["-c", `set -o pipefail; curl -fL -o "${destPath}" "${url}" 2>&1 | stdbuf -oL tr '\\r' '\\n'`]);
    cmd.stdout.on("data", (data: string) => {
      const match = data.match(/^\s*(\d+)/);
      if (match && !data.includes("% Total")) onProgress(Math.round(parseFloat(match[1])));
    });
    cmd.on("close", ({ code }) => code === 0 ? resolve() : reject(new Error(`curl exited with code ${code}`)));
    cmd.on("error", reject);
    cmd.spawn().catch(reject);
  });
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
    setStatus("Téléchargement d'AIRI... 0%");
    await downloadFile(DOWNLOAD_URLS.windows, exePath, p => setStatus(`Téléchargement d'AIRI... ${p}%`));

    setStatus("Installation en cours...");
    await sh(`"${exePath}" /S /D=${airiDir}`);

    setStatus("Nettoyage en cours...");
    await remove(exePath);
  } else {
    const debPath = await join(tmp, "airi.deb");
    setStatus("Téléchargement d'AIRI... 0%");
    await downloadFile(DOWNLOAD_URLS.linux_deb, debPath, p => setStatus(`Téléchargement d'AIRI... ${p}%`));
    const workDir = await join(tmp, "airi_work");

    setStatus("Extraction en cours...");
    await sh(`mkdir -p "${workDir}" && cd "${workDir}" && ar x "${debPath}"`);
    await sh(`tar xf "${workDir}"/data.tar.* -C "${airiDir}"`);

    setStatus("Nettoyage en cours...");
    await sh(`rm -rf "${workDir}" "${debPath}"`);
  }

  setStatus("Installation terminée !");
}

async function hashFile(path: string): Promise<string> {
  return shOutput(`sha256sum "${path}"`).then(out => out.split(" ")[0]);
}

function getExecPath(airiDir: string, os: string): Promise<string> {
  return os === "windows"
    ? join(airiDir, "AIRI.exe")
    : join(airiDir, "opt", "AIRI", "airi");
}

export async function checkAiriInstallation(appDir: string): Promise<"missing" | "corrupted" | "ok"> {
  const os = platform();
  const airiDir = await join(appDir, "airi");
  if (!await exists(airiDir)) return "missing";

  const exec = await getExecPath(airiDir, os);
  if (!await exists(exec)) return "corrupted";

  const expectedHash = AIRI_EXEC_HASHES[os === "windows" ? "windows" : "linux"];
  if (!expectedHash) return "ok"; // hash non défini, on skip la vérification

  const currentHash = await hashFile(exec);
  if (currentHash !== expectedHash) return "corrupted";

  return "ok";
}

export async function killAiri(): Promise<void> {
  const os = platform();
  if (os === "windows") {
    await sh("taskkill /F /IM AIRI.exe").catch(() => {});
  } else {
    await sh("pkill -9 -f 'opt/AIRI/airi'").catch(() => {});
  }
  // Wait for the LevelDB LOCK to be released
  await new Promise(resolve => setTimeout(resolve, 500));
}

export async function launchAiri(appDir: string): Promise<void> {
  const os = platform();
  const airiDir = await join(appDir, "airi");

  if (os === "windows") {
    const execPath = await join(airiDir, "AIRI.exe");
    await sh(`start "" "${execPath}"`);
  } else {
    const execPath = await join(airiDir, "opt", "AIRI", "airi");
    await sh(`nohup "${execPath}" > /dev/null 2>&1 &`);
  }
}
