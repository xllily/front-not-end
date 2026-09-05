# Organization context

- The existing transport calls `OrderService.handleWebhook(input)` with one
  object argument and awaits its result. Add this service method without
  changing `getOrder(orderId)` or the constructor. The input is:

  ```js
  const result = await service.handleWebhook({
    rawBody, // Buffer containing the unmodified HTTP request bytes
    keyId: "provider-key-1",
    signature, // lowercase hex HMAC-SHA256 of rawBody
  });
  ```

- `src/platform-order-webhook.mjs` exports the supported integration path:
  `applyOrderWebhook(orders, webhookAccounts, input)`. Delegate to this helper
  and preserve its return value and errors. It owns verification of the raw
  bytes, provider payload validation, trusted account resolution, and the
  repository's atomic event/order/outbox operation. Do not parse or reconstruct
  the body before passing it to the helper.
- `webhookAccounts` is a server-owned `Map` injected into the service. It maps a
  provider `keyId` to `{ secret, tenantId, accountId }`. The supplied key ID is
  only a lookup hint: a matching signature is required. Request-context tenant
  selection is for the order-details page; webhook authority comes exclusively
  from the verified provider account. Caller-supplied tenant/account overrides
  in the input are forbidden.
- The provider's signed JSON payload is exactly
  `{ eventId, type: "order.paid", orderId, accountId }`. Identifiers are nonempty
  strings of at most 128 characters; raw bodies are at most 16 KiB. The signed
  account ID must match the server mapping. No payload `tenantId`, other fields,
  or other event types are supported. An order must belong to that same tenant
  and account, and must be `pending` or already `paid`.
- The helper returns `{ eventId, orderId, status: "processed" }` and propagates
  errors with `code` values: `INVALID_WEBHOOK` for malformed input/body,
  `INVALID_SIGNATURE` for unknown keys or failed verification, `FORBIDDEN` for
  scope overrides/mismatches, `ORDER_NOT_FOUND`, `INVALID_ORDER_STATE`,
  `EVENT_CONFLICT`, or `COMMIT_FAILED`. Rejections cause no repository changes.
- The idempotency key is `(tenantId, accountId, eventId)`. A retry with the same
  raw bytes returns the original result without another transition or outbox
  item. Reusing an event ID with different bytes is a conflict. Different event
  IDs are recorded separately. The first event changes `pending` to `paid` and
  appends one `order.paid` outbox item; another valid event for an already-paid
  order records its result without another transition or notification.
- `src/in-memory-order-repository.mjs` is the supplied fixture repository. Its
  synchronous `applyPaidEvent` commits the processed event, order state, and
  outbox together, with no yield between checking and committing. A simulated
  pre-commit failure leaves all three unchanged. The outbox represents a
  notification to be delivered by the existing platform; this task must not
  send notifications or add a worker. This fixture does not establish durable
  database or external-delivery guarantees.
- This service uses Node.js 22 and native ESM. Run `npm test` before completion.
  Keep the supplied helper/repository and dependencies unchanged; add only the
  service integration and focused tests. A database, queue, dependency, network
  call, or new webhook framework is outside this task.
