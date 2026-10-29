import { decryptString, encryptString, pkceChallenge, randomUrlSafe } from "../crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { KVLike } from "./mock-adapter";

export const SWIGGY_BASE = "https://mcp.swiggy.com";

export interface OAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  tokenEncKey: string;
}

interface ServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
}

interface PendingAuth {
  verifier: string;
  clientId: string;
  userId: string;
  redirectUri: string;
}

const PENDING_TTL_SECONDS = 600;

export class SwiggyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwiggyAuthError";
  }
}

async function fetchMetadata(fetchFn: typeof fetch): Promise<ServerMetadata> {
  const res = await fetchFn(`${SWIGGY_BASE}/.well-known/oauth-authorization-server`);
  if (!res.ok) throw new SwiggyAuthError(`OAuth metadata unavailable (${res.status})`);
  const meta = (await res.json()) as Partial<ServerMetadata>;
  return {
    authorization_endpoint: meta.authorization_endpoint ?? `${SWIGGY_BASE}/auth/authorize`,
    token_endpoint: meta.token_endpoint ?? `${SWIGGY_BASE}/auth/token`,
    registration_endpoint: meta.registration_endpoint,
  };
}

/** Use a configured client id, else a previously registered one, else register dynamically (RFC 7591). */
async function resolveClientId(
  db: PrismaClient,
  userId: string,
  meta: ServerMetadata,
  cfg: OAuthConfig,
  fetchFn: typeof fetch,
): Promise<string> {
  if (cfg.clientId) return cfg.clientId;
  const existing = await db.swiggyConnection.findUnique({ where: { userId } });
  if (existing?.clientId) return existing.clientId;
  if (!meta.registration_endpoint) throw new SwiggyAuthError("Swiggy did not advertise dynamic client registration");

  const res = await fetchFn(meta.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Swigaya",
      redirect_uris: [cfg.redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp:tools",
    }),
  });
  if (!res.ok) throw new SwiggyAuthError(`Client registration failed (${res.status})`);
  const body = (await res.json()) as { client_id?: string };
  if (!body.client_id) throw new SwiggyAuthError("Client registration returned no client_id");
  await db.swiggyConnection.upsert({
    where: { userId },
    create: { userId, clientId: body.client_id },
    update: { clientId: body.client_id },
  });
  return body.client_id;
}

/** Step 1: build the authorize URL and stash the PKCE verifier in KV. */
export async function startAuth(opts: {
  db: PrismaClient;
  kv: KVLike;
  userId: string;
  cfg: OAuthConfig;
  fetchFn?: typeof fetch;
}): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const meta = await fetchMetadata(fetchFn);
  const clientId = await resolveClientId(opts.db, opts.userId, meta, opts.cfg, fetchFn);
  const verifier = randomUrlSafe(48);
  const state = randomUrlSafe(24);
  const pending: PendingAuth = { verifier, clientId, userId: opts.userId, redirectUri: opts.cfg.redirectUri };
  await opts.kv.put(`oauth:state:${state}`, JSON.stringify(pending), { expirationTtl: PENDING_TTL_SECONDS });

  const url = new URL(meta.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", opts.cfg.redirectUri);
  url.searchParams.set("code_challenge", await pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "mcp:tools");
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

async function saveTokens(db: PrismaClient, userId: string, tok: TokenResponse, cfg: OAuthConfig, clientId: string) {
  const data = {
    clientId,
    accessTokenEnc: await encryptString(tok.access_token, cfg.tokenEncKey),
    refreshTokenEnc: tok.refresh_token ? await encryptString(tok.refresh_token, cfg.tokenEncKey) : null,
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
    scope: tok.scope ?? null,
  };
  await db.swiggyConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

/** Step 2: exchange the code (state must match what we stored). */
export async function handleCallback(opts: {
  db: PrismaClient;
  kv: KVLike;
  code: string;
  state: string;
  cfg: OAuthConfig;
  fetchFn?: typeof fetch;
}): Promise<{ userId: string }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const stateKey = `oauth:state:${opts.state}`;
  const pending = (await opts.kv.get(stateKey, "json")) as PendingAuth | null;
  if (!pending) throw new SwiggyAuthError("Login expired or invalid state. Please try connecting again.");
  // One-time use.
  await opts.kv.put(stateKey, "null", { expirationTtl: 60 });

  const meta = await fetchMetadata(fetchFn);
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code: opts.code,
    code_verifier: pending.verifier,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
  };
  if (opts.cfg.clientSecret) body.client_secret = opts.cfg.clientSecret;
  const res = await fetchFn(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new SwiggyAuthError(`Token exchange failed (${res.status})`);
  const tok = (await res.json()) as TokenResponse;
  if (!tok.access_token) throw new SwiggyAuthError("Token response missing access_token");
  await saveTokens(opts.db, pending.userId, tok, opts.cfg, pending.clientId);
  return { userId: pending.userId };
}

/** Clears stored tokens. The OAuth client id stays so the next connect can reuse it. */
export async function disconnectSwiggy(db: PrismaClient, userId: string): Promise<void> {
  await db.swiggyConnection.updateMany({
    where: { userId },
    data: { accessTokenEnc: null, refreshTokenEnc: null, expiresAt: null, scope: null },
  });
}

/** Returns a valid bearer token, refreshing if needed. Null when the user has not connected. */
export async function getAccessToken(opts: {
  db: PrismaClient;
  userId: string;
  cfg: OAuthConfig;
  fetchFn?: typeof fetch;
}): Promise<string | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const conn = await opts.db.swiggyConnection.findUnique({ where: { userId: opts.userId } });
  if (!conn?.accessTokenEnc || !opts.cfg.tokenEncKey) return null;

  const stillValid = !conn.expiresAt || conn.expiresAt.getTime() - Date.now() > 60_000;
  if (stillValid) return decryptString(conn.accessTokenEnc, opts.cfg.tokenEncKey);

  if (!conn.refreshTokenEnc || !conn.clientId) return null;
  const refresh = await decryptString(conn.refreshTokenEnc, opts.cfg.tokenEncKey);
  const meta = await fetchMetadata(fetchFn);
  const res = await fetchFn(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refresh, client_id: conn.clientId }),
  });
  if (!res.ok) return null;
  const tok = (await res.json()) as TokenResponse;
  if (!tok.access_token) return null;
  if (!tok.refresh_token) tok.refresh_token = refresh;
  await saveTokens(opts.db, opts.userId, tok, opts.cfg, conn.clientId);
  return tok.access_token;
}
