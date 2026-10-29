// AES-256-GCM helpers (WebCrypto, works in Workers) used to encrypt Swiggy
// OAuth tokens before they are written to D1.

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64ToBytes(keyB64);
  if (raw.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes, base64 encoded");
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptString(plain: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

export async function decryptString(payloadB64: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const bytes = b64ToBytes(payloadB64);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource);
  return new TextDecoder().decode(plain);
}

export function randomUrlSafe(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return bytesToB64(digest).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
