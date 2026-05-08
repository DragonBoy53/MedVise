const { loadEnv } = require("../config/loadEnv");
loadEnv();

const { spawnSync } = require("child_process");

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

const REQUIRED_BINARIES = [
  ["PG_DUMP_BIN", process.env.PG_DUMP_BIN || "pg_dump"],
  ["PG_RESTORE_BIN", process.env.PG_RESTORE_BIN || "pg_restore"],
];

for (const [envKey, binary] of REQUIRED_BINARIES) {
  const result = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    console.log(`${envKey}: missing (${binary})`);
  } else {
    const version = String(result.stdout || result.stderr || "").trim();
    console.log(`${envKey}: present (${version || binary})`);
  }
}
