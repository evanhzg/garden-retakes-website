import crypto from "node:crypto";

/**
 * Presigned R2 URLs, signed here rather than proxied.
 *
 * A CS2 demo is 100-300 MB and Vercel caps a serverless function's request
 * body at 4.5 MB, so an upload can never pass through this app. The browser
 * has to PUT straight to R2, which means handing it a URL that is already
 * authorised — hence SigV4 presigning.
 *
 * Hand-rolled rather than pulling in @aws-sdk/client-s3 + s3-request-presigner:
 * that is several megabytes of dependency for one signature, and the algorithm
 * is fully specified. R2 is S3-compatible with region "auto".
 *
 * Credentials never leave the server; the browser only ever sees a URL that
 * expires.
 */

const REGION = "auto";
const SERVICE = "s3";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export const r2Configured = () => r2Config() !== null;

const sha256Hex = (v: string) => crypto.createHash("sha256").update(v, "utf8").digest("hex");
const hmac = (key: crypto.BinaryLike, data: string) =>
  crypto.createHmac("sha256", key).update(data, "utf8").digest();

/** RFC 3986 — S3 needs the stricter escaping, and "/" preserved in the path. */
function uriEncode(value: string, keepSlashes = false): string {
  let out = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  if (keepSlashes) out = out.replace(/%2F/g, "/");
  return out;
}

/**
 * A presigned URL for one object.
 *
 * `expiresIn` is capped at a week by the spec; demo uploads want a generous
 * window because a 250 MB file on a domestic connection is not quick.
 */
export function presign(
  method: "GET" | "PUT" | "DELETE",
  key: string,
  expiresIn = 3600,
  cfg = r2Config()
): string | null {
  if (!cfg) return null;

  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${uriEncode(cfg.bucket, true)}/${uriEncode(key, true)}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(expiresIn, 604800)),
    "X-Amz-SignedHeaders": "host",
  };

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    // The body is not known at signing time for a browser PUT.
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dateStamp), REGION), SERVICE),
    "aws4_request"
  );
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Delete an object server-side (used when a processed demo is wiped). */
export async function deleteObject(key: string): Promise<boolean> {
  const url = presign("DELETE", key, 120);
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "DELETE" });
    // 204 on success; 404 means it is already gone, which is the same outcome.
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/** Where an uploaded demo lives in the bucket. */
export const demoKey = (id: number, fileName: string) =>
  `demos/${id}-${fileName.replace(/[^A-Za-z0-9._-]/g, "_")}`.slice(0, 300);
