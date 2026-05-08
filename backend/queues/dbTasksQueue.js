const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const redisUrl = process.env.REDIS_URL;

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

module.exports = {
  dbTasksQueue,
  enqueueDbTask,
  connection,
};
