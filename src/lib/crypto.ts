import crypto from "node:crypto";

/**
 * AES-256-GCM at-rest encryption for Google tokens.
 * Layout of the returned buffer: [12-byte IV][16-byte auth tag][ciphertext].
 */
function key(): Buffer {
  const k = process.env.TOKEN_ENC_KEY;
  if (!k) throw new Error("TOKEN_ENC_KEY is not set");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes (base64)");
  return buf;
}

export function encrypt(plain: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decrypt(buf: Buffer): string {
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

/** Supabase returns bytea as a \x-prefixed hex string over PostgREST. */
export function bytesToHex(buf: Buffer): string {
  return "\\x" + buf.toString("hex");
}
export function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex.replace(/^\\x/, ""), "hex");
}
