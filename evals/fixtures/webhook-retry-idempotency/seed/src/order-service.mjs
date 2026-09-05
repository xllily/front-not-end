export class OrderService {
  constructor({ orders, requestContext, webhookAccounts }) {
    this.orders = orders;
    this.requestContext = requestContext;
    this.webhookAccounts = webhookAccounts;
  }

  async getOrder(orderId) {
    return this.orders.findById(this.requestContext.tenantId, orderId);
  }
}
