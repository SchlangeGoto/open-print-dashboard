import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";

import type { ApiClient } from "./api";

let currentToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Register this device for print and spool notifications.
 *
 * Remote push needs a development or release build; Expo Go cannot receive
 * them. Every failure is silent because notifications are optional.
 */
export async function registerPushToken(api: ApiClient): Promise<void> {
  if (currentToken || Platform.OS === "web") return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Print updates",
        importance: AndroidImportance.DEFAULT,
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (permission.status !== "granted") return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) return;

    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;
    await api.registerPushToken(token, Platform.OS);
    currentToken = token;
  } catch {
    // No notification permission, no EAS project, or Expo Go: stay quiet.
  }
}

export async function unregisterPushToken(api: ApiClient): Promise<void> {
  const token = currentToken;
  currentToken = null;
  if (!token) return;
  try {
    await api.unregisterPushToken(token);
  } catch {
    // The session may already be gone; the server drops tokens with the user.
  }
}
