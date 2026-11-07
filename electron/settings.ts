import { app, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

export type Provider = 'gemini' | 'openrouter';
export type ApprovalMode = 'ask' | 'edits' | 'readonly';

export type PublicSettings = {
  modelProvider: Provider;
  geminiModel: string;
  openrouterModel: string;
  approvalMode: ApprovalMode;
  autoFallback: boolean;
  fallbackModels: string;
  editorFontSize: number;
  editorWordWrap: boolean;
  temperature: number;
  recentProjects: string[];
  lastProjectRoot: string | null;
  githubLogin: string | null;
  hasGeminiKey: boolean;
  geminiKeyHint: string | null;
  hasOpenRouterKey: boolean;
  openrouterKeyHint: string | null;
  hasGithubToken: boolean;
  githubTokenHint: string | null;
  encryptionAvailable: boolean;
  settingsPath: string;
};

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_OPENROUTER_MODEL = 'openrouter/free';
export const SECRET_KEYS = ['geminiKey', 'openrouterKey', 'githubToken'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
export type SettingKey =
  | SecretKey
  | 'modelProvider'
  | 'geminiModel'
  | 'openrouterModel'
  | 'approvalMode'
  | 'autoFallback'
  | 'fallbackModels'
  | 'editorFontSize'
  | 'editorWordWrap'
  | 'temperature'
  | 'recentProjects'
  | 'lastProjectRoot'
  | 'githubLogin';

const ALLOWED_KEYS = new Set<string>([
  ...SECRET_KEYS,
  'modelProvider',
  'geminiModel',
  'openrouterModel',
  'approvalMode',
  'autoFallback',
  'fallbackModels',
  'editorFontSize',
  'editorWordWrap',
  'temperature',
  'recentProjects',
  'lastProjectRoot',
  'githubLogin'
]);

const settings: Record<string, string> = {};
const isSecret = (key: string): key is SecretKey => (SECRET_KEYS as readonly string[]).includes(key);

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function maskSecret(value: string | undefined | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '••••';
  return '••••' + trimmed.slice(-4);
}

export async function loadSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(settingsFile(), 'utf8')) as Record<string, unknown>;
    for (const [rawKey, rawValue] of Object.entries(raw)) {
      if (typeof rawValue !== 'string') continue;
      if (rawKey.endsWith('Encrypted')) {
        const key = rawKey.replace(/Encrypted$/, '');
        if (!isSecret(key)) continue;
        if (!encryptionAvailable()) continue;
        try {
          settings[key] = safeStorage.decryptString(Buffer.from(rawValue, 'base64'));
        } catch {
          // Encryption key changed or profile moved: drop the unreadable secret.
        }
        continue;
      }
      // Never load legacy plaintext credentials.
      if (isSecret(rawKey)) continue;
      if (ALLOWED_KEYS.has(rawKey)) settings[rawKey] = rawValue;
    }
  } catch {
    // First run, or no settings file yet.
  }

  // Migrate v0.1 names and human-readable approval modes.
  if (!settings.openrouterModel && settings.defaultModel) settings.openrouterModel = settings.defaultModel;
  delete settings.defaultModel;
  if (settings.approvalMode) {
    const mode = settings.approvalMode;
    settings.approvalMode =
      mode === 'Auto-allow file edits, ask for commands'
        ? 'edits'
        : mode === 'Auto-allow safe read-only actions'
          ? 'readonly'
          : mode === 'edits' || mode === 'readonly'
            ? mode
            : 'ask';
  }
  if (settings.modelProvider !== 'openrouter') settings.modelProvider = 'gemini';
  settings.geminiModel = normalizeGeminiModel(settings.geminiModel);
}

export function normalizeGeminiModel(model: string | undefined): string {
  const normalized = String(model || '').trim().replace(/^models\//, '');
  if (!normalized || normalized === 'gemini-2.5-flash') return DEFAULT_GEMINI_MODEL;
  return normalized;
}

export function getSetting(key: SettingKey | string, fallback = ''): string {
  return settings[key] ?? fallback;
}

export function getSecret(key: SecretKey): string | undefined {
  const value = settings[key];
  return value && value.trim() ? value.trim() : undefined;
}

export function getRecentProjects(): string[] {
  try {
    const parsed = JSON.parse(settings.recentProjects || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberProject(root: string) {
  const list = getRecentProjects().filter(item => item.toLowerCase() !== root.toLowerCase());
  list.unshift(root);
  settings.recentProjects = JSON.stringify(list.slice(0, 12));
  settings.lastProjectRoot = root;
}

export function forgetProject(root: string) {
  settings.recentProjects = JSON.stringify(
    getRecentProjects().filter(item => item.toLowerCase() !== root.toLowerCase())
  );
  if (settings.lastProjectRoot === root) delete settings.lastProjectRoot;
}

export function publicSettings(): PublicSettings {
  const recent = getRecentProjects();
  return {
    modelProvider: settings.modelProvider === 'openrouter' ? 'openrouter' : 'gemini',
    geminiModel: normalizeGeminiModel(settings.geminiModel),
    openrouterModel: settings.openrouterModel || DEFAULT_OPENROUTER_MODEL,
    approvalMode:
      settings.approvalMode === 'edits' || settings.approvalMode === 'readonly'
        ? settings.approvalMode
        : 'ask',
    autoFallback: settings.autoFallback !== 'false',
    fallbackModels: settings.fallbackModels || 'openrouter/free',
    editorFontSize: clampNumber(settings.editorFontSize, 11, 22, 14),
    editorWordWrap: settings.editorWordWrap !== 'false',
    temperature: clampNumber(settings.temperature, 0, 2, 0.2),
    recentProjects: recent,
    lastProjectRoot: settings.lastProjectRoot || null,
    githubLogin: settings.githubLogin || null,
    hasGeminiKey: Boolean(getSecret('geminiKey')),
    geminiKeyHint: maskSecret(getSecret('geminiKey')),
    hasOpenRouterKey: Boolean(getSecret('openrouterKey')),
    openrouterKeyHint: maskSecret(getSecret('openrouterKey')),
    hasGithubToken: Boolean(getSecret('githubToken')),
    githubTokenHint: maskSecret(getSecret('githubToken')),
    encryptionAvailable: encryptionAvailable(),
    settingsPath: settingsFile()
  };
}

export type SettingsPatch = Partial<
  Record<
    | SecretKey
    | 'modelProvider'
    | 'geminiModel'
    | 'openrouterModel'
    | 'approvalMode'
    | 'autoFallback'
    | 'fallbackModels'
    | 'editorFontSize'
    | 'editorWordWrap'
    | 'temperature'
    | 'githubLogin'
    | 'lastProjectRoot'
    | 'recentProjects'
    | 'clearSecrets',
    string | boolean | number | string[]
  >
>;

export async function updateSettings(patch: SettingsPatch) {
  const next = { ...settings };

  if (Array.isArray(patch.clearSecrets)) {
    for (const secret of patch.clearSecrets) {
      if (isSecret(secret)) delete next[secret];
      if (secret === 'githubToken') delete next.githubLogin;
    }
  }

  for (const [key, rawValue] of Object.entries(patch)) {
    if (key === 'clearSecrets') continue;
    if (!ALLOWED_KEYS.has(key)) throw new Error('Unsupported setting: ' + key);
    if (rawValue === undefined || rawValue === null) continue;

    if (isSecret(key)) {
      const value = String(rawValue).trim();
      // Blank means "keep the existing key" so the UI never has to round-trip secrets.
      if (!value) continue;
      if (value.length > 500) throw new Error('That credential looks too long.');
      if (!encryptionAvailable()) {
        throw new Error(
          'OS credential encryption is unavailable, so DARKI will not write API keys to disk in plaintext.'
        );
      }
      next[key] = value;
      continue;
    }

    if (key === 'modelProvider') {
      if (rawValue !== 'gemini' && rawValue !== 'openrouter') throw new Error('Unknown provider.');
      next[key] = String(rawValue);
    } else if (key === 'geminiModel') {
      next[key] = normalizeGeminiModel(String(rawValue));
    } else if (key === 'openrouterModel') {
      next[key] = String(rawValue).trim() || DEFAULT_OPENROUTER_MODEL;
    } else if (key === 'approvalMode') {
      if (rawValue !== 'ask' && rawValue !== 'edits' && rawValue !== 'readonly') {
        throw new Error('Unknown approval mode.');
      }
      next[key] = String(rawValue);
    } else if (key === 'autoFallback') {
      next[key] = rawValue === true || rawValue === 'true' ? 'true' : 'false';
    } else if (key === 'editorFontSize') {
      next[key] = String(clampNumber(rawValue, 11, 22, 14));
    } else if (key === 'temperature') {
      next[key] = String(clampNumber(rawValue, 0, 2, 0.2));
    } else if (key === 'editorWordWrap') {
      next[key] = rawValue === true || rawValue === 'true' ? 'true' : 'false';
    } else if (key === 'recentProjects') {
      const list = Array.isArray(rawValue) ? rawValue : [];
      next[key] = JSON.stringify(list.filter((item): item is string => typeof item === 'string').slice(0, 12));
    } else {
      next[key] = String(rawValue);
    }
  }

  Object.keys(settings).forEach(key => delete settings[key]);
  Object.assign(settings, next);
  await persistSettings();
  return publicSettings();
}

export async function setGithubLogin(login: string | null) {
  if (login) settings.githubLogin = login;
  else delete settings.githubLogin;
  await persistSettings();
}

async function persistSettings() {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (isSecret(key)) {
      if (!value) continue;
      if (!encryptionAvailable()) {
        throw new Error('OS credential encryption is unavailable; refusing to store credentials in plaintext.');
      }
      output[key + 'Encrypted'] = safeStorage.encryptString(value).toString('base64');
    } else {
      output[key] = value;
    }
  }
  const file = settingsFile();
  const temp = file + '.tmp';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(output, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed * 100) / 100));
}
