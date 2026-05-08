const { loadEnv } = require("../config/loadEnv");
loadEnv();

const REQUIRED_KEYS = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function describeValue(key) {
  const value = process.env[key];

  if (!value) {
    return "missing";
  }

  return "present";
}

for (const key of REQUIRED_KEYS) {
  console.log(`${key}: ${describeValue(key)}`);
}
