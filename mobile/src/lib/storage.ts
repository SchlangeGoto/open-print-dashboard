import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SERVER_URL_KEY = "opd.serverUrl";
const SESSION_KEY = "opd.session";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function webStorage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

async function readItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return webStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      webStorage()?.setItem(key, value);
    } catch {
      // Browser storage can be unavailable in private mode.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      webStorage()?.removeItem(key);
    } catch {
      // Ignore unavailable browser storage.
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function loadStoredServerUrl(): Promise<string | null> {
  return readItem(SERVER_URL_KEY);
}

export async function saveStoredServerUrl(url: string): Promise<void> {
  await writeItem(SERVER_URL_KEY, url);
}

export async function loadStoredSession(): Promise<StoredSession | null> {
  const raw = await readItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function saveStoredSession(session: StoredSession): Promise<void> {
  await writeItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredSession(): Promise<void> {
  await removeItem(SESSION_KEY);
}
