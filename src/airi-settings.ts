import { invoke } from "@tauri-apps/api/core";

// ─── Raw API ──────────────────────────────────────────────────────────────────

export interface AiriSettingEntry {
  key: string;
  value: string;
}

/** Get a single AIRI localStorage value (raw string). */
export async function airiGet(key: string): Promise<string | null> {
  return invoke<string | null>("airi_get_setting", { key });
}

/** Set a single AIRI localStorage value (raw string). */
export async function airiSet(key: string, value: string): Promise<void> {
  return invoke("airi_set_setting", { key, value });
}

/** Delete a single AIRI localStorage key. */
export async function airiDelete(key: string): Promise<void> {
  return invoke("airi_delete_setting", { key });
}

/** Get all AIRI localStorage entries. */
export async function airiGetAll(): Promise<AiriSettingEntry[]> {
  return invoke<AiriSettingEntry[]>("airi_get_all_settings");
}

/** Write multiple settings at once. */
export async function airiSetBatch(
  settings: Record<string, string>
): Promise<void> {
  return invoke("airi_set_settings", { settings });
}

// ─── Typed Helpers ────────────────────────────────────────────────────────────

// JSON helper (most complex settings are stored as JSON strings)
async function getJson<T>(key: string): Promise<T | null> {
  const raw = await airiGet(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

async function setJson<T>(key: string, value: T): Promise<void> {
  return airiSet(key, JSON.stringify(value));
}

// ─── Cards ────────────────────────────────────────────────────────────────────
//
// Storage format: Record<cardId, AiriCardData>
// The card id is the MAP KEY, not a field inside the object.
// greetings[] is required by AIRI.

export interface AiriCardExtension {
  modules: {
    consciousness: { provider: string; model: string };
    speech: { provider: string; model: string; voice_id: string; pitch?: number; rate?: number; ssml?: boolean; language?: string };
    vrm?: object;
    live2d?: object;
  };
  agents: Record<string, unknown>;
}

export interface AiriCard {
  id: string;                        // Map key in storage (not serialized inside value)
  name: string;
  version?: string;
  description?: string;
  creator?: string;
  personality?: string;
  scenario?: string;
  greetings: string[];               // Required — at least one greeting message
  systemPrompt?: string;
  postHistoryInstructions?: string;
  tags?: string[];
  extensions: {
    airi: AiriCardExtension;
    [key: string]: unknown;
  };
}

// VueUse serializes Map as: JSON.stringify(Array.from(map.entries()))
// → storage format is [[id, cardData], [id2, cardData2], ...]
type AiriCardsEntries = [string, Omit<AiriCard, "id">][];

/** Returns all cards as an array. Returns [] when airi-cards key doesn't exist yet. */
export async function getCards(): Promise<AiriCard[]> {
  const entries = await getJson<AiriCardsEntries>("airi-cards");
  if (!entries || !Array.isArray(entries)) return [];
  return entries.map(([id, card]) => ({ id, ...card }));
}

/** Overwrites the entire card list. */
export async function setCards(cards: AiriCard[]): Promise<void> {
  const entries: AiriCardsEntries = cards.map(({ id, ...rest }) => [id, rest]);
  return setJson("airi-cards", entries);
}

/**
 * Adds a card only if its id is not already present in the current LevelDB state.
 *
 * IMPORTANT — LevelDB WAL ordering: Tauri (rusty-leveldb) writes land in the WAL
 * with a higher sequence number than AIRI's compacted SSTable entries, so every
 * write from Tauri overrides what AIRI saved. By skipping the write when the card
 * already exists we avoid clobbering AIRI's own state (e.g. its default "ReLU" card
 * that AIRI re-adds on every launch). AIRI will always call its own initialize()
 * and add the "default" card if it is missing from our WAL entry.
 */
export async function addCard(card: AiriCard): Promise<void> {
  const existing = await getCards();
  if (existing.some(c => c.id === card.id)) return;
  return setCards([...existing, card]);
}

/** Replaces an existing card by id, or adds it if not present. */
export async function upsertCard(card: AiriCard): Promise<void> {
  const existing = await getCards();
  const filtered = existing.filter(c => c.id !== card.id);
  return setCards([...filtered, card]);
}

export async function getActiveCardId(): Promise<string | null> {
  return airiGet("airi-card-active-id");
}

export async function setActiveCardId(id: string): Promise<void> {
  return airiSet("airi-card-active-id", id);
}

// ─── Speech / Voice ───────────────────────────────────────────────────────────

export interface SpeechSettings {
  provider: string | null;
  model: string | null;
  language: string | null;
  voice: string | null;
  pitch: number | null;
  rate: number | null;
}

export async function getSpeechSettings(): Promise<SpeechSettings> {
  const [provider, model, language, voice, pitch, rate] = await Promise.all([
    airiGet("settings/speech/active-provider"),
    airiGet("settings/speech/active-model"),
    airiGet("settings/speech/language"),
    airiGet("settings/speech/voice"),
    airiGet("settings/speech/pitch"),
    airiGet("settings/speech/rate"),
  ]);
  return {
    provider,
    model,
    language,
    voice,
    pitch: pitch !== null ? Number(pitch) : null,
    rate: rate !== null ? Number(rate) : null,
  };
}

export async function setSpeechSettings(
  s: Partial<SpeechSettings>
): Promise<void> {
  const batch: Record<string, string> = {};
  if (s.provider !== undefined && s.provider !== null)
    batch["settings/speech/active-provider"] = s.provider;
  if (s.model !== undefined && s.model !== null)
    batch["settings/speech/active-model"] = s.model;
  if (s.language !== undefined && s.language !== null)
    batch["settings/speech/language"] = s.language;
  if (s.voice !== undefined && s.voice !== null)
    batch["settings/speech/voice"] = s.voice;
  if (s.pitch !== undefined && s.pitch !== null)
    batch["settings/speech/pitch"] = String(s.pitch);
  if (s.rate !== undefined && s.rate !== null)
    batch["settings/speech/rate"] = String(s.rate);
  return airiSetBatch(batch);
}

// ─── Hearing (Microphone / Transcription) ────────────────────────────────────

export async function getHearingSettings() {
  const [provider, model, autoSend, autoSendDelay] = await Promise.all([
    airiGet("settings/hearing/active-provider"),
    airiGet("settings/hearing/active-model"),
    airiGet("settings/hearing/auto-send-enabled"),
    airiGet("settings/hearing/auto-send-delay"),
  ]);
  return {
    provider,
    model,
    autoSend: autoSend === "true",
    autoSendDelay: autoSendDelay !== null ? Number(autoSendDelay) : 2000,
  };
}

// ─── WebSocket Connection ─────────────────────────────────────────────────────

export async function getWebSocketUrl(): Promise<string> {
  return (await airiGet("settings/connection/websocket-url")) ?? "ws://localhost:6121/ws";
}

export async function setWebSocketUrl(url: string): Promise<void> {
  return airiSet("settings/connection/websocket-url", url);
}

// ─── General App Settings ─────────────────────────────────────────────────────

export async function getLanguage(): Promise<string> {
  return (await airiGet("settings/language")) ?? "en";
}

export async function setLanguage(lang: string): Promise<void> {
  return airiSet("settings/language", lang);
}

export async function getAlwaysOnTop(): Promise<boolean> {
  return (await airiGet("settings/always-on-top")) === "true";
}

export async function setAlwaysOnTop(v: boolean): Promise<void> {
  return airiSet("settings/always-on-top", String(v));
}

// ─── AI Consciousness (LLM Provider) ─────────────────────────────────────────

export async function getConsciousnessSettings() {
  const [provider, model] = await Promise.all([
    airiGet("settings/consciousness/active-provider"),
    airiGet("settings/consciousness/active-model"),
  ]);
  return { provider, model };
}

export async function setConsciousnessSettings(s: {
  provider?: string;
  model?: string;
}): Promise<void> {
  const batch: Record<string, string> = {};
  if (s.provider) batch["settings/consciousness/active-provider"] = s.provider;
  if (s.model) batch["settings/consciousness/active-model"] = s.model;
  return airiSetBatch(batch);
}

// ─── Credentials / Providers ──────────────────────────────────────────────────

export interface ProviderCredentials {
  [providerName: string]: {
    baseUrl?: string;
    apiKey?: string;
    [key: string]: unknown;
  };
}

export async function getProviderCredentials(): Promise<ProviderCredentials> {
  return (await getJson<ProviderCredentials>("settings/credentials/providers")) ?? {};
}

export async function setProviderCredentials(
  creds: ProviderCredentials
): Promise<void> {
  return setJson("settings/credentials/providers", creds);
}

export async function setProviderApiKey(
  provider: string,
  apiKey: string
): Promise<void> {
  const creds = await getProviderCredentials();
  creds[provider] = { ...(creds[provider] ?? {}), apiKey };
  return setProviderCredentials(creds);
}

// ─── MCP Servers (JSON file, not LevelDB) ─────────────────────────────────────
// These are stored in ~/.config/ai.moeru.airi/mcp.json — use Tauri fs plugin directly.

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}
