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
}

module.exports = { loadEnv };
