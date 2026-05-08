const { loadEnv } = require("../config/loadEnv");
loadEnv();

const REQUIRED_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function describeValue(key) {
  const value = process.env[key];

  if (!value) {
    return "missing";
  }

  if (key === "REDIS_URL") {
    return /^rediss?:\/\/.+/i.test(value.trim())
      ? "present, valid Redis URL shape"
      : `present, invalid shape (${value.trim().slice(0, 12)})`;
  }

  return "present";
}

for (const key of REQUIRED_KEYS) {
  console.log(`${key}: ${describeValue(key)}`);
}
