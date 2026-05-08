const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const axios = require("axios");

const DEFAULT_CHAT_IMAGES_BUCKET = "chat-images";
const DEFAULT_BACKUP_BUCKET = "database-backups";

function getSupabaseUrl() {
  return (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
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
  await ensureBucket(bucket);

  const url = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`;

  const response = await axios.post(url, fs.createReadStream(filePath), {
    headers: storageHeaders({
      "Content-Type": contentType,
      "cache-control": cacheControl,
      "x-upsert": "false",
    }),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return response.data;
}

async function ensureBucket(bucket) {
  const { supabaseUrl } = requireSupabaseStorageConfig();
  const bucketUrl = `${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`;

  try {
    await axios.get(bucketUrl, {
      headers: storageHeaders(),
    });
    return;
  } catch (error) {
    if (error?.response?.status !== 404) {
      throw error;
    }
  }

  try {
    await axios.post(
      `${supabaseUrl}/storage/v1/bucket`,
      {
        name: bucket,
        public: false,
      },
      {
        headers: storageHeaders({
          "Content-Type": "application/json",
        }),
      },
    );
  } catch (error) {
    if (error?.response?.status !== 409) {
      throw error;
    }
  }
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
  const response = await axios.post(
    url,
    { expiresIn },
    {
      headers: storageHeaders({
        "Content-Type": "application/json",
      }),
    },
  );

  const signedURL = response.data?.signedURL || response.data?.signedUrl || null;
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

  const response = await axios.get(url, {
    headers: storageHeaders(),
    responseType: "stream",
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  await new Promise((resolve, reject) => {
    const writable = fs.createWriteStream(filePath);
    response.data.pipe(writable);
    response.data.on("error", reject);
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
