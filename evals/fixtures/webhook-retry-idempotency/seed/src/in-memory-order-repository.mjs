function reject(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export class InMemoryOrderRepository {
  #state;
  #failNextCommit = false;

  constructor(orders) {
    this.#state = {
      orders: new Map(orders.map((order) => [
        JSON.stringify([order.tenantId, order.id]),
        structuredClone(order),
      ])),
      events: new Map(),
      outbox: [],
    };
  }

  findById(tenantId, orderId) {
    return structuredClone(this.#state.orders.get(JSON.stringify([tenantId, orderId])) ?? null);
  }

  applyPaidEvent({ tenantId, accountId, eventId, orderId, bodyHash }) {
    const eventKey = JSON.stringify([tenantId, accountId, eventId]);
    const previous = this.#state.events.get(eventKey);
    if (previous) {
      if (previous.bodyHash !== bodyHash) reject("EVENT_CONFLICT");
      return structuredClone(previous.result);
    }

    const orderKey = JSON.stringify([tenantId, orderId]);
    const order = this.#state.orders.get(orderKey);
    if (!order) reject("ORDER_NOT_FOUND");
    if (order.accountId !== accountId) reject("FORBIDDEN");
    if (!["pending", "paid"].includes(order.status)) reject("INVALID_ORDER_STATE");

    // One synchronous commit models the platform's atomic persistence boundary.
    const next = structuredClone(this.#state);
    const result = { eventId, orderId, status: "processed" };
    if (order.status === "pending") {
      next.orders.set(orderKey, { ...order, status: "paid" });
      next.outbox.push({ tenantId, accountId, eventId, orderId, type: "order.paid" });
    }
    next.events.set(eventKey, {
      tenantId, accountId, eventId, bodyHash, status: "processed", result,
    });
    if (this.#failNextCommit) {
      this.#failNextCommit = false;
      reject("COMMIT_FAILED");
    }
    this.#state = next;
    return structuredClone(result);
  }

  failNextCommit() {
    this.#failNextCommit = true;
  }

  snapshot() {
    return structuredClone({
      orders: [...this.#state.orders.values()],
      events: [...this.#state.events.values()],
      outbox: this.#state.outbox,
    });
  }
}
