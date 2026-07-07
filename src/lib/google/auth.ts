import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { admin } from "../supabase";
import { encrypt, decrypt, bytesToHex, hexToBytes } from "../crypto";

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function oauthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/** Consent URL. access_type=offline + prompt=consent guarantees a refresh token. */
export function consentUrl(): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

/** Exchange the callback code and persist the (encrypted) tokens. */
export async function storeCodeTokens(code: string): Promise<void> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("No refresh_token returned — revoke access and re-consent.");
  }
  await admin.from("google_oauth").upsert({
    id: true,
    refresh_token_enc: bytesToHex(encrypt(tokens.refresh_token)),
    access_token_enc: tokens.access_token
      ? bytesToHex(encrypt(tokens.access_token))
      : null,
    access_token_expires: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
    scopes: SCOPES,
    connected_at: new Date().toISOString(),
  });
}

/**
 * Returns an OAuth2 client with a valid access token, refreshing if needed and
 * persisting the refreshed access token. Published-production app → the refresh
 * token does not expire on a 7-day clock.
 */
export async function authedClient(): Promise<OAuth2Client> {
  const { data, error } = await admin
    .from("google_oauth")
    .select("refresh_token_enc, access_token_enc, access_token_expires")
    .eq("id", true)
    .single();
  if (error || !data) throw new Error("Google not connected — visit /api/auth/google");

  const client = oauthClient();
  client.setCredentials({
    refresh_token: decrypt(hexToBytes(data.refresh_token_enc)),
    access_token: data.access_token_enc
      ? decrypt(hexToBytes(data.access_token_enc))
      : undefined,
    expiry_date: data.access_token_expires
      ? new Date(data.access_token_expires).getTime()
      : undefined,
  });

  const fresh = Date.now() < (Number(data.access_token_expires && new Date(data.access_token_expires).getTime()) - 60_000);
  if (!fresh) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    await admin
      .from("google_oauth")
      .update({
        access_token_enc: credentials.access_token
          ? bytesToHex(encrypt(credentials.access_token))
          : null,
        access_token_expires: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        last_refresh_at: new Date().toISOString(),
      })
      .eq("id", true);
  }
  return client;
}
