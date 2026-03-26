/* global __dirname */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Directory where backups are stored
const BACKUP_DIR = path.join(__dirname, "../backups");

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// POST /api/admin/backup 
async function backupController(req, res) {
  try {
    // Fetch all tables we want to back up
    const tables = ["users"]; // will add more when needed

    const backupData = {};

    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT * FROM ${table}`);
        backupData[table] = result.rows;
      } catch (e) {
        // Table might not exist yet thus skip it
        backupData[table] = [];
        console.warn(`[backup] Skipping table "${table}": ${e.message}`);
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup_${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify({
      createdAt: new Date().toISOString(),
      tables: backupData,
    }, null, 2));

    console.log(`[backup] Backup saved: ${filename}`);

    res.status(200).json({
      message: `Backup completed successfully. File: ${filename}`,
      filename,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[backup] Error:", err);
    res.status(500).json({ message: "Backup failed.", details: err.message });
  }
}

// POST /api/admin/recovery
async function recoveryController(req, res) {
  try {
    // Find the latest backup file
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("backup_") && f.endsWith(".json"))
      .sort(); // lexicographic sort works because of ISO timestamp format

    if (files.length === 0) {
      return res.status(404).json({ message: "No backup files found. Please run a backup first." });
    }

    const latestFile = files[files.length - 1];
    const filepath = path.join(BACKUP_DIR, latestFile);
    const raw = fs.readFileSync(filepath, "utf-8");
    const backup = JSON.parse(raw);

    const tables = Object.keys(backup.tables);

    for (const table of tables) {
      const rows = backup.tables[table];
      if (!rows || rows.length === 0) continue;

      try {
        // Clear existing data and restore from backup
        await pool.query(`DELETE FROM ${table}`);

        for (const row of rows) {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
          const columnNames = columns.join(", ");

          await pool.query(
            `INSERT INTO ${table} (${columnNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
        }

        console.log(`[recovery] Restored table "${table}" (${rows.length} rows)`);
      } catch (e) {
        console.warn(`[recovery] Skipping table "${table}": ${e.message}`);
      }
    }

    res.status(200).json({
      message: `Recovery completed successfully from: ${latestFile}`,
      restoredFrom: latestFile,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[recovery] Error:", err);
    res.status(500).json({ message: "Recovery failed.", details: err.message });
  }
}

module.exports = { backupController, recoveryController };