// =============================================================================
// googleDriveSync.js - Android Google Drive App Data sync (cross-device)
// Version: 1.1
// Last Updated: 2026-04-29
//
// PROJECT:      Rolodeck (project v1.5.3)
// FILES:        googleDriveSync.js (this file — Android cloud sync)
//               iCloudSync.js      (iOS cloud sync)
//               cloudSync.js       (unified entry point)
//
// ARCHITECTURE:
//   - Uses the Drive "appDataFolder" scope — files are private to the app,
//     invisible in the user's Google Drive UI, but persist across reinstalls
//     and sync across devices on the same Google account.
//   - OAuth 2.0 PKCE via expo-auth-session (web client ID, no client secret in
//     the app). Tokens stored in expo-secure-store.
//   - Token refresh is handled automatically before each API call.
//   - signInWithGoogle() must be called from a user gesture (button press) the
//     first time. Subsequent launches auto-refresh silently.
//
// SETUP REQUIRED (one-time, in Google Cloud Console):
//   1. Enable Google Drive API for your project
//   2. Create an OAuth 2.0 Client (type: Web application)
//   3. Add authorized redirect URI: https://auth.expo.io/@ardingate-studios-llc/rolodeck
//   4. Set EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID in .env and eas.json
//
// DATA FILE:  callcard-data.json in Drive appDataFolder.
//   Shape: { customers: Customer[], syncedAt: ISO-string, schemaVersion: number }
//
// CHANGE LOG:
// v1.1  2026-04-29  Claude  Switch redirect URI to Expo auth proxy (Google Web app type rejects custom schemes;
//                           proxy receives the OAuth callback and deep-links back to callcard://)
// v1.0  2026-04-29  Claude  Initial Google Drive App Data sync implementation
// =============================================================================

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';

// Google Web application OAuth clients reject custom URI schemes (callcard://).
// The Expo auth proxy receives the callback at this HTTPS URI then deep-links
// back to callcard:// so the app can complete the PKCE exchange.
const REDIRECT_URI = 'https://auth.expo.io/@ardingate-studios-llc/rolodeck';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
const FILE_NAME = 'callcard-data.json';
const TOKEN_KEY = 'callcard_gdrive_tokens';
const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};
const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

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
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function isSignedIn() {
  const t = await loadTokens();
  return !!t?.refresh_token;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  if (!CLIENT_ID) throw new Error('EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID not set');
  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    usePKCE: true,
  });
  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success') return false;

  const tokenRes = await AuthSession.exchangeCodeAsync(
    {
      clientId: CLIENT_ID,
      code: result.params.code,
      redirectUri: REDIRECT_URI,
      extraParams: { code_verifier: request.codeVerifier },
    },
    DISCOVERY,
  );
  await saveTokens({
    access_token: tokenRes.accessToken,
    refresh_token: tokenRes.refreshToken,
    expires_at: tokenRes.issuedAt + (tokenRes.expiresIn ?? 3600),
  });
  return true;
}

async function getValidAccessToken() {
  const tokens = await loadTokens();
  if (!tokens) return null;

  if (Date.now() / 1000 < tokens.expires_at - 60) return tokens.access_token;

  // Refresh
  if (!tokens.refresh_token) return null;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    await clearTokens();
    return null;
  }
  const data = await res.json();
  const updated = {
    ...tokens,
    access_token: data.access_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
  };
  await saveTokens(updated);
  return updated.access_token;
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

async function driveGet(path, token) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive GET ${path} → ${res.status}`);
  return res;
}

async function findFile(token) {
  const res = await driveGet(
    `/drive/v3/files?spaces=appDataFolder&q=name%3D'${FILE_NAME}'&fields=files(id,modifiedTime)`,
    token,
  );
  const { files } = await res.json();
  return files?.[0] ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function uploadToGoogleDrive(payload) {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not signed in to Google Drive');

  const existing = await findFile(token);
  const body = JSON.stringify(payload);

  if (existing) {
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body,
      },
    );
  } else {
    const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
    const boundary = 'callcard_boundary_xyz';
    const multipart =
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n` +
      `--${boundary}--`;
    await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`,
        },
        body: multipart,
      },
    );
  }
}

export async function downloadFromGoogleDrive() {
  const token = await getValidAccessToken();
  if (!token) return null;
  const file = await findFile(token);
  if (!file) return null;
  const res = await driveGet(
    `/drive/v3/files/${file.id}?alt=media`,
    token,
  );
  return await res.json();
}

export async function getCloudTimestamp() {
  try {
    const data = await downloadFromGoogleDrive();
    return data?.syncedAt ?? null;
  } catch {
    return null;
  }
}
