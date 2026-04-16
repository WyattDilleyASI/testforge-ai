const crypto = require("crypto");

const ENCRYPTION_KEY = process.env.SERVER_ENCRYPTION_KEY;
const ALGORITHM = "aes-256-gcm";

function encrypt(text) {
  if (!ENCRYPTION_KEY) {
    console.warn("⚠ SERVER_ENCRYPTION_KEY not set — storing tokens unencrypted");
    return text;
  }
  const key = crypto.scryptSync(ENCRYPTION_KEY, "testforge-salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decrypt(data) {
  if (!ENCRYPTION_KEY) return data;
  const [ivHex, authTagHex, encrypted] = data.split(":");
  const key = crypto.scryptSync(ENCRYPTION_KEY, "testforge-salt", 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = { encrypt, decrypt };