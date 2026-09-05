import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// NAS 的 SSH 私鑰要能「讀回來實際連線用」，跟使用者密碼的單向雜湊不一樣，
// 所以是可逆加密(AES-256-GCM)，不是雜湊。金鑰從 JWT_SECRET 用固定 salt 衍生出來，
// 不用另外管理一把新的加密金鑰——JWT_SECRET 本來就是需要妥善保管、有備份的機密。
const KEY_DERIVATION_SALT = "expense-platform-nas-backup-key-v1";
const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET 未設定");
  return scryptSync(secret, KEY_DERIVATION_SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("格式不正確的加密內容");
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
