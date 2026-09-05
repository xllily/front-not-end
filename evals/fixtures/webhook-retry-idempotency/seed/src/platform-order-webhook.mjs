import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function reject(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

export function applyOrderWebhook(repository, webhookAccounts, input) {
  if (!input || typeof input !== "object") reject("INVALID_WEBHOOK");
  if ("tenantId" in input || "accountId" in input) reject("FORBIDDEN");
  if (Object.keys(input).some((key) => !["rawBody", "keyId", "signature"].includes(key))) {
    reject("INVALID_WEBHOOK");
  }
  const { rawBody, keyId, signature } = input;
  if (!Buffer.isBuffer(rawBody) || rawBody.length < 1 || rawBody.length > 16 * 1024) {
    reject("INVALID_WEBHOOK");
  }
  if (!validId(keyId) || typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) {
    reject("INVALID_SIGNATURE");
  }
  const account = webhookAccounts.get(keyId);
  if (!account || !validId(account.tenantId) || !validId(account.accountId)
    || typeof account.secret !== "string" || account.secret.length === 0) {
    reject("INVALID_SIGNATURE");
  }
  const expected = createHmac("sha256", account.secret).update(rawBody).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) reject("INVALID_SIGNATURE");

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    reject("INVALID_WEBHOOK");
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) reject("INVALID_WEBHOOK");
  if ("tenantId" in event || event.accountId !== account.accountId) reject("FORBIDDEN");
  if (Object.keys(event).some((key) => !["eventId", "type", "orderId", "accountId"].includes(key))
    || !validId(event.eventId) || !validId(event.orderId) || event.type !== "order.paid") {
    reject("INVALID_WEBHOOK");
  }

  return repository.applyPaidEvent({
    tenantId: account.tenantId,
    accountId: account.accountId,
    eventId: event.eventId,
    orderId: event.orderId,
    bodyHash: createHash("sha256").update(rawBody).digest("hex"),
  });
}
