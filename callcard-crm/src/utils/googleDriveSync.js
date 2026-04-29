// =============================================================================
// googleDriveSync.js - Android Google Drive App Data sync (cross-device)
// Version: 2.0
// Last Updated: 2026-04-29
//
// PROJECT:      Callcard CRM (project v2.0.0)
// FILES:        googleDriveSync.js (this file — Android cloud sync)
//               iCloudSync.js      (iOS cloud sync)
//               cloudSync.js       (unified entry point)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Uses the Drive "appDataFolder" scope — files are private to the app,
//     invisible in the user's Google Drive UI, but persist across reinstalls
//     and sync across devices on the same Google account.
//   - OAuth 2.0 PKCE via expo-auth-session 6.x. Custom URI scheme redirect
//     (callcard://gdrive) — the legacy auth.expo.io proxy was removed in
//     SDK 50+ and won't authenticate. The Google Cloud Console client must be
//     created as type "Android" (or "iOS" — package-name based, accepts
//     custom schemes) NOT "Web application."
//   - Tokens stored in expo-secure-store. Refresh requested via
//     access_type=offline + prompt=consent on initial sign-in.
//   - Token refresh is automatic before each API call. Network failures
//     (5xx) do not sign the user out; only confirmed auth failures (400/401)
//     clear the stored tokens.
//
// SETUP REQUIRED (one-time, in Google Cloud Console):
//   1. Enable Google Drive API
//   2. Create OAuth 2.0 Client ID, type "Android"
//   3. Package name: com.ardingate.rolodeck
//   4. SHA-1 from EAS build credentials
//   5. Set EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID in .env and eas.json
//
// DATA FILE:  callcard-data.json in Drive appDataFolder.
//   Shape: { customers: Customer[], syncedAt: ISO-string, schemaVersion: number }
//
// CHANGE LOG:
// v2.0  2026-04-29  Claude  Auth + transport rewrite (project v2.0.0)
//       - Replaced removed auth.expo.io proxy with custom-scheme makeRedirectUri.
//         The Web-application Google client type rejects custom schemes and the
//         proxy is gone in SDK 50+; v1.x would not authenticate in production.
//       - Added access_type=offline + prompt=consent so refresh_token is
//         returned reliably (Google omits it on re-consent without these)
//       - Defensive expires_at math: Math.floor(Date.now()/1000) + expiresIn,
//         no longer dependent on tokenRes.issuedAt (often undefined → NaN)
//       - clearTokens only on 400/401 (real auth failures); 5xx is treated as
//         transient so a flaky token endpoint does not silently sign the user out
//       - res.ok checked on every Drive API call; failures throw with status
//         (was: failed uploads silently treated as success)
//       - URLSearchParams used for query encoding (was: hand-spliced filename
//         that broke if FILE_NAME ever contained a quote)
//       - On 401 from any Drive call, tokens are cleared so the UI surfaces
//         "reconnect Google Drive" instead of silent indefinite failure
// v1.1  2026-04-29  Claude  Switch redirect URI to Expo auth proxy (incorrect)
// v1.0  2026-04-29  Claude  Initial Google Drive App Data sync implementation
// =============================================================================

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
const FILE_NAME = 'callcard-data.json';
const TOKEN_KEY = 'callcard_gdrive_tokens';
const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint:         'https://oauth2.googleapis.com/token',
  revocationEndpoint:    'https://oauth2.googleapis.com/revoke',
};
const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

// Custom URI scheme — registered as `scheme: 'callcard'` in app.json. The
// Google client must be of type "Android" (package-name based) so it accepts
// custom schemes. Web-application clients reject these.
function getRedirectUri() {
  return AuthSession.makeRedirectUri({ scheme: 'callcard', path: 'gdrive' });
}

// ── Token storage ─────────────────────────────────────────────────────────────

async function saveTokens(tokens) {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
}

async function loadTokens() {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

export async function isSignedIn() {
  const t = await loadTokens();
  return !!t?.refresh_token;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  if (!CLIENT_ID) throw new Error('EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID not set');
  const redirectUri = getRedirectUri();

  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    scopes: SCOPES,
    redirectUri,
    usePKCE: true,
    // access_type=offline ensures Google returns a refresh_token; prompt=consent
    // forces the consent screen on re-sign-in so the refresh_token is also
    // returned the second time around (otherwise omitted by default).
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });
  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success') return false;

  const tokenRes = await AuthSession.exchangeCodeAsync(
    {
      clientId: CLIENT_ID,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier },
    },
    DISCOVERY,
  );

  const expiresIn = Number.isFinite(tokenRes.expiresIn) ? tokenRes.expiresIn : 3600;
  await saveTokens({
    access_token:  tokenRes.accessToken,
    refresh_token: tokenRes.refreshToken,
    expires_at:    Math.floor(Date.now() / 1000) + expiresIn,
  });
  return true;
}

async function getValidAccessToken() {
  const tokens = await loadTokens();
  if (!tokens) return null;

  // 60-second skew buffer so requests don't hit Google with a token that just
  // expired in transit.
  if (Number.isFinite(tokens.expires_at) && Date.now() / 1000 < tokens.expires_at - 60) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) return null;
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    grant_type:    'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  if (!res.ok) {
    // Only sign out on confirmed auth failures. A 5xx (transient backend
    // outage) leaves the refresh_token in place so we retry next call.
    if (res.status === 400 || res.status === 401) {
      await clearTokens();
    }
    return null;
  }
  const data = await res.json();
  const updated = {
    ...tokens,
    access_token: data.access_token,
    expires_at:   Math.floor(Date.now() / 1000) + (Number.isFinite(data.expires_in) ? data.expires_in : 3600),
  };
  await saveTokens(updated);
  return updated.access_token;
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

// Wraps a fetch with auth + 401-aware token clearing. On confirmed auth
// failure the tokens are wiped so the UI surfaces a "reconnect" state.
async function driveFetch(url, init = {}) {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not signed in to Google Drive');
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    await clearTokens();
    throw new Error(`Drive auth rejected (${res.status})`);
  }
  return res;
}

async function findFile() {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q:      `name='${FILE_NAME}'`,
    fields: 'files(id,modifiedTime)',
  });
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
  if (!res.ok) throw new Error(`Drive findFile failed (${res.status})`);
  const { files } = await res.json();
  return files?.[0] ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function uploadToGoogleDrive(payload) {
  const body = JSON.stringify(payload);
  const existing = await findFile();

  if (existing) {
    const res = await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    );
    if (!res.ok) throw new Error(`Drive PATCH failed (${res.status})`);
  } else {
    // Multipart upload combines metadata + media in a single request. The
    // boundary is generated per-call so it can't accidentally appear in the
    // body content (a literal collision in JSON-encoded notes would corrupt
    // the request).
    const boundary = `callcard_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
    const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body}\r\n` +
      `--${boundary}--`;
    const res = await driveFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method:  'POST',
        headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body:    multipart,
      },
    );
    if (!res.ok) throw new Error(`Drive POST failed (${res.status})`);
  }
}

export async function downloadFromGoogleDrive() {
  const file = await findFile();
  if (!file) return null;
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
  if (!res.ok) throw new Error(`Drive download failed (${res.status})`);
  try {
    return await res.json();
  } catch {
    return null; // corrupt blob in Drive — treat as no data
  }
}

export async function getCloudTimestamp() {
  try {
    const data = await downloadFromGoogleDrive();
    return data?.syncedAt ?? null;
  } catch {
    return null;
  }
}
