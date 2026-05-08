const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

function loadEnv() {
  const backendDir = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(backendDir, "..");
  const envPaths = [
    path.join(backendDir, ".env.local"),
    path.join(backendDir, ".env"),
    path.join(repoRoot, ".env.local"),
    path.join(repoRoot, ".env"),
  ].filter((envPath) => fs.existsSync(envPath));

  if (!envPaths.length) {
    return;
  }

  dotenv.config({
    path: envPaths,
    quiet: true,
  });

  applyEnvAliases();
}

function applyEnvAliases() {
  const aliases = {
    DATABASE_URL: [
      "storage_DATABASE_URL",
      "storage_POSTGRES_URL",
      "POSTGRES_URL",
      "POSTGRES_PRISMA_URL",
    ],
    SUPABASE_URL: ["EXPO_PUBLIC_SUPABASE_URL"],
    SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_KEY", "SUPABASE_KEY"],
  };

  for (const [targetKey, sourceKeys] of Object.entries(aliases)) {
    if (process.env[targetKey]) {
      continue;
    }

    const sourceKey = sourceKeys.find((key) => process.env[key]);
    if (sourceKey) {
      process.env[targetKey] = process.env[sourceKey];
    }
  }
}

module.exports = { loadEnv };
