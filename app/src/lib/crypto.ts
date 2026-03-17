import crypto from "crypto";
import os from "os";
import fs from "fs";
import path from "path";

const SEED_FILE = path.join(process.cwd(), "data", ".seed");
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  let seed: string;
  if (fs.existsSync(SEED_FILE)) {
    seed = fs.readFileSync(SEED_FILE, "utf-8").trim();
  } else {
    seed = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(SEED_FILE), { recursive: true });
    fs.writeFileSync(SEED_FILE, seed, { mode: 0o600 });
  }
  const hostname = os.hostname();
  return crypto.createHash("sha256").update(`${hostname}:${seed}`).digest();
}

export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptApiKey(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, tagHex, dataHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf-8") + decipher.final("utf-8");
}
