const { loadEnv } = require("../config/loadEnv");
loadEnv();

const {
  isSupabaseStorageConfigured,
} = require("../services/supabaseStorageService");

function describe(key, fallback = "(empty)") {
  const value = process.env[key];
  return value ? `${key}=${value}` : `${key}=${fallback}`;
}

console.log(describe("SUPABASE_URL"));
console.log(describe("SUPABASE_BACKUP_BUCKET"));
console.log(describe("SUPABASE_BACKUP_PREFIX"));
console.log(describe("SUPABASE_CHAT_IMAGES_BUCKET"));
console.log(
  `SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY ? "(present)" : "(missing)"}`,
);
console.log(`storageConfigured=${isSupabaseStorageConfigured()}`);
