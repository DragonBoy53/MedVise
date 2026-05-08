const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const redisUrl = process.env.REDIS_URL;
const DB_WORKER_HEARTBEAT_KEY = "medvise:db-worker:heartbeat";

if (!redisUrl) {
  console.warn(
    "[dbTasksQueue] REDIS_URL is not set. Backup and recovery jobs cannot be queued until Redis is configured.",
  );
}

const connection = redisUrl
  ? new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  : null;

const dbTasksQueue = connection
  ? new Queue("db-tasks", {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: {
          age: 60 * 60 * 24 * 7,
          count: 100,
        },
        removeOnFail: {
          age: 60 * 60 * 24 * 14,
          count: 100,
        },
      },
    })
  : null;

async function enqueueDbTask(name, payload) {
  if (!dbTasksQueue) {
    const error = new Error("REDIS_URL is required to queue database tasks.");
    error.code = "QUEUE_NOT_CONFIGURED";
    throw error;
  }

  return dbTasksQueue.add(name, payload, {
    jobId: `${name}-${payload.backupJobId || payload.recoveryJobId}`,
  });
}

async function getDbQueueStatus() {
  if (!dbTasksQueue || !connection) {
    return {
      configured: false,
      workerOnline: false,
      workerLastSeenAt: null,
      counts: null,
    };
  }

  const [counts, heartbeat] = await Promise.all([
    dbTasksQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
    connection.get(DB_WORKER_HEARTBEAT_KEY),
  ]);

  let parsedHeartbeat = null;
  if (heartbeat) {
    try {
      parsedHeartbeat = JSON.parse(heartbeat);
    } catch {
      parsedHeartbeat = { timestamp: heartbeat };
    }
  }

  return {
    configured: true,
    workerOnline: Boolean(parsedHeartbeat?.timestamp),
    workerLastSeenAt: parsedHeartbeat?.timestamp || null,
    counts,
  };
}

module.exports = {
  DB_WORKER_HEARTBEAT_KEY,
  dbTasksQueue,
  enqueueDbTask,
  getDbQueueStatus,
  connection,
};
