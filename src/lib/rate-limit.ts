/**
 * Best-effort, per-instance rate limiter.
 *
 * IMPORTANT LIMITATION: Cloud Run can run multiple instances concurrently,
 * each with its own memory, and instances are recycled on scale-to-zero.
 * This limiter only protects a single instance's memory -- it reduces
 * abuse from a single client hammering one warm instance, but it is NOT a
 * substitute for an edge-level control (Cloud Armor, Firebase App Check,
 * or a shared store like Firestore/Redis) if this ever needs to withstand
 * a real distributed abuse attempt.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function isAllowed(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= maxRequests) {
    return false;
  }

  existing.count += 1;
  return true;
}

export function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000);

// Don't let this housekeeping timer keep the process alive -- it should
// never block a graceful SIGTERM shutdown on Cloud Run (see server.mjs).
cleanupTimer.unref();
