const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { Readable } = require("stream");

const DEFAULT_CHAT_IMAGES_BUCKET = "chat-images";
const DEFAULT_BACKUP_BUCKET = "database-backups";

function getSupabaseUrl() {
  const raw = (process.env.SUPABASE_URL || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    return raw.replace(/\/+$/, "").replace(
      /\/(?:storage|rest|auth|functions)\/v1\/?$/i,
      "",
    );
  }
}

function getServiceKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY ||
    ""
  );
}

function isSupabaseStorageConfigured() {
  return Boolean(getSupabaseUrl() && getServiceKey());
}

function requireSupabaseStorageConfig() {
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getServiceKey();

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase Storage.",
    );
  }

  return { supabaseUrl, serviceKey };
}

function storageHeaders(extraHeaders = {}) {
  const { serviceKey } = requireSupabaseStorageConfig();
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...extraHeaders,
  };
}

async function parseStorageResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function assertStorageResponse(response, action) {
  if (response.ok) {
    return parseStorageResponse(response);
  }

  const details = await parseStorageResponse(response);
  const error = new Error(
    details?.message || `${action} failed with status ${response.status}`,
  );
  error.status = response.status;
  error.response = details;
  throw error;
}

function encodeStoragePath(value) {
  return String(value)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function safePathPart(value, fallback) {
  const sanitized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || fallback;
}

function extensionForUpload({ originalName, mimeType }) {
  const ext = path.extname(originalName || "").replace(".", "").toLowerCase();
  if (ext) return ext;

  const subtype = String(mimeType || "").split("/")[1];
  return subtype ? subtype.replace(/[^a-z0-9]+/gi, "").toLowerCase() : "jpg";
}

function chatImagesBucket() {
  return process.env.SUPABASE_CHAT_IMAGES_BUCKET || DEFAULT_CHAT_IMAGES_BUCKET;
}

function backupBucket() {
  return process.env.SUPABASE_BACKUP_BUCKET || DEFAULT_BACKUP_BUCKET;
}

function buildChatImagePath({ clerkUserId, originalName, mimeType }) {
  const userFolder = safePathPart(clerkUserId, "anonymous");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = crypto.randomBytes(8).toString("hex");
  const ext = extensionForUpload({ originalName, mimeType });

  return `${userFolder}/chat-images/${timestamp}-${random}.${ext}`;
}

function buildBackupPath(backupJobId) {
  const prefix = (process.env.SUPABASE_BACKUP_PREFIX || "medvise/backups")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return `${prefix}/backup-${backupJobId}-${timestamp}.dump`;
}

function toSupabaseStorageUri(bucket, objectPath) {
  return `supabase://${bucket}/${objectPath}`;
}

function parseSupabaseStorageUri(storageUri) {
  const match = /^supabase:\/\/([^/]+)\/(.+)$/.exec(storageUri || "");
  if (!match) {
    throw new Error(`Invalid Supabase Storage URI: ${storageUri}`);
  }

  return {
    bucket: match[1],
    objectPath: match[2],
  };
}

async function uploadFileToBucket({
  bucket,
  objectPath,
  filePath,
  contentType = "application/octet-stream",
  cacheControl = "3600",
}) {
  const { supabaseUrl } = requireSupabaseStorageConfig();
  if (!bucket) {
    throw new Error("SUPABASE_BACKUP_BUCKET is empty or invalid.");
  }
  if (!objectPath) {
    throw new Error("Supabase Storage object path is empty or invalid.");
  }
  await ensureBucket(bucket);

  const url = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: storageHeaders({
      "Content-Type": contentType,
      "cache-control": cacheControl,
      "x-upsert": "false",
    }),
    body: fs.createReadStream(filePath),
    duplex: "half",
  });

  return assertStorageResponse(response, "Supabase Storage upload");
}

async function ensureBucket(bucket) {
  const { supabaseUrl } = requireSupabaseStorageConfig();
  if (!bucket) {
    throw new Error("Supabase Storage bucket name is empty or invalid.");
  }
  const bucketUrl = `${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`;

  const existingBucket = await fetch(bucketUrl, {
    headers: storageHeaders(),
  });

  if (existingBucket.ok) {
    return;
  }

  if (existingBucket.status !== 404) {
    await assertStorageResponse(existingBucket, "Supabase Storage bucket lookup");
  }

  const createdBucket = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: storageHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      name: bucket,
      public: false,
    }),
  });

  if (createdBucket.ok || createdBucket.status === 409) {
    return;
  }

  await assertStorageResponse(createdBucket, "Supabase Storage bucket creation");
}

async function uploadChatImage({ file, clerkUserId }) {
  if (!file?.path) return null;

  const stat = await fsp.stat(file.path);
  const bucket = chatImagesBucket();
  const objectPath = buildChatImagePath({
    clerkUserId,
    originalName: file.originalname,
    mimeType: file.mimetype,
  });

  await uploadFileToBucket({
    bucket,
    objectPath,
    filePath: file.path,
    contentType: file.mimetype || "image/jpeg",
  });

  return {
    attachmentType: "image",
    bucket,
    path: objectPath,
    mimeType: file.mimetype || "image/jpeg",
    sizeBytes: stat.size,
    originalName: file.originalname || null,
    storageUri: toSupabaseStorageUri(bucket, objectPath),
  };
}

async function createSignedUrl({ bucket, objectPath, expiresIn = 3600 }) {
  if (!bucket || !objectPath) return null;

  const { supabaseUrl } = requireSupabaseStorageConfig();
  const url = `${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: storageHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ expiresIn }),
  });

  const data = await assertStorageResponse(response, "Supabase signed URL creation");
  const signedURL = data?.signedURL || data?.signedUrl || null;
  if (!signedURL) return null;
  if (/^https?:\/\//i.test(signedURL)) return signedURL;

  return `${supabaseUrl}/storage/v1${signedURL.startsWith("/") ? signedURL : `/${signedURL}`}`;
}

async function uploadBackupArtifact({ backupJobId, filePath }) {
  const stat = await fsp.stat(filePath);
  const bucket = backupBucket();
  const objectPath = buildBackupPath(backupJobId);

  await uploadFileToBucket({
    bucket,
    objectPath,
    filePath,
    contentType: "application/octet-stream",
    cacheControl: "0",
  });

  return {
    bucket,
    path: objectPath,
    storageUri: toSupabaseStorageUri(bucket, objectPath),
    sizeBytes: stat.size,
  };
}

async function downloadStorageUriToFile(storageUri, filePath) {
  const { bucket, objectPath } = parseSupabaseStorageUri(storageUri);
  const { supabaseUrl } = requireSupabaseStorageConfig();
  const url = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`;

  const response = await fetch(url, {
    headers: storageHeaders(),
  });

  if (!response.ok) {
    await assertStorageResponse(response, "Supabase Storage download");
  }

  await new Promise((resolve, reject) => {
    const writable = fs.createWriteStream(filePath);
    const readable = Readable.fromWeb(response.body);
    readable.pipe(writable);
    readable.on("error", reject);
    writable.on("error", reject);
    writable.on("finish", resolve);
  });
}

module.exports = {
  createSignedUrl,
  downloadStorageUriToFile,
  isSupabaseStorageConfigured,
  parseSupabaseStorageUri,
  uploadBackupArtifact,
  uploadChatImage,
};
