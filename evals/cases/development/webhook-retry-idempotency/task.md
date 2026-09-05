# Product request

When the payment provider sends a paid-order webhook, update the matching order
so its owner sees the payment on the existing order-details page. Provider
retries, including concurrent deliveries, must not repeat the order transition
or its notification. Reject invalid signatures and attempts to select another
account. A delivery that fails before saving must be safe to retry.
