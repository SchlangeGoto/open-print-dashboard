import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Bump this whenever the mobile bundle changes in a way you need to verify on
 * a device. Settings shows it so a stale Metro bundle is immediately obvious.
 */
export const APP_BUILD_TAG = "in-app-qr-1";

export interface BuildInfo {
  buildTag: string;
  platform: string;
  osVersion: string;
  runtime: string;
  executionEnvironment: string;
  expoGoVersion: string | null;
  sdkVersion: string | null;
  metroHost: string | null;
}

export function getBuildInfo(): BuildInfo {
  const isExpoGo = Boolean(Constants.expoGoConfig || Constants.expoVersion);
  const runtime =
    Platform.OS === "web"
      ? "Web"
      : isExpoGo
        ? "Expo Go"
        : Constants.executionEnvironment === "standalone"
          ? "Standalone"
          : Constants.executionEnvironment === "bare"
            ? "Bare React Native"
            : "Development build";

  return {
    buildTag: APP_BUILD_TAG,
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    runtime,
    executionEnvironment: String(Constants.executionEnvironment),
    expoGoVersion: Constants.expoVersion,
    sdkVersion: Constants.expoConfig?.sdkVersion ?? null,
    metroHost: Constants.expoConfig?.hostUri ?? null,
  };
}
