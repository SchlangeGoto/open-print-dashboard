/**
 * The hosted service URL is baked into the app. Self-hosted users enter their
 * own server URL instead; the same app supports both.
 */
export const HOSTED_SERVER_URL = (
  process.env.EXPO_PUBLIC_HOSTED_URL ?? "https://app.openprintdash.app"
).replace(/\/+$/, "");

export function isHostedServer(url: string | null | undefined): boolean {
  return (url ?? "").replace(/\/+$/, "") === HOSTED_SERVER_URL;
}
