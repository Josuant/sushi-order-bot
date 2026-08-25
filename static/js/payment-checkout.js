/**
 * Pasarela de Pagos & Checkout Omnicanal - Ecosistema Sushi Erizo
 * Implementa US-04: Links Dinámicos (PayByLink), SPEI con copiado CLABE aislado y Webhooks bancarios
 */

export class PaymentCheckoutModule {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.clabeNumber = "646180123456789012";
    this.bankName = "STP / Sushi Erizo Operaciones";
    this.beneficiary = "Sushi Erizo S.A. de C.V.";
  }

  /**
   * Genera el payload de PayByLink para abrirse en webview nativo (Mercado Pago / Stripe)
   */
  generatePayByLinkUrl(order) {
    const baseUrl = "https://pay.sushierizo.mx/checkout";
    const token = btoa(`${order.id}-${order.total}-${Date.now()}`);
    return `${baseUrl}?order_id=${order.id}&amount=${order.total}&token=${token}&provider=mercadopago_stripe`;
  }

  /**
   * Genera el mensaje aislado de WhatsApp para transferencia SPEI (Copiado táctil inmediato - US-04)
   */
  generateSPEIMessage(order) {
    return {
      type: "spei_isolated",
      orderId: order.id,
      amount: order.total,
      bank: "STP",
      beneficiary: this.beneficiary,
      clabe: this.clabeNumber,
      infoText: `🏦 *TRANSFERENCIA SPEI*\nTotal exacto: *$${order.total} MXN*\nBanco: *STP* | Beneficiario: *${this.beneficiary}*\n\nToca abajo para copiar tu CLABE:`,
      isolatedClabeText: this.clabeNumber,
      copyActionText: "📋 Copiar CLABE (1 toque)",
      footerNotice: "⚡ El pago se acredita automáticamente por Webhook en tiempo real."
    };
  }

  /**
   * Procesa el Webhook bancario entrante (Mercado Pago / Stripe / SPEI STP)
   * Cambia el estado de la orden a 'PAGADO' en tiempo real (< 1s)
   */
  async simulateBankWebhook(orderId, paymentMethod = "stripe_card") {
    console.log(`[WEBHOOK] Recibiendo notificación bancaria para orden #${orderId}...`);
    
    // Simular latencia de red bancaria (400ms - 800ms)
    await new Promise(res => setTimeout(res, 500));

    const isSPEI = paymentMethod.includes("spei") || paymentMethod.includes("stp");
    const webhookPayload = {
      event: "payment.succeeded",
      provider: isSPEI ? "STP_SPEI_GATEWAY" : "MERCADO_PAGO_STRIPE",
      order_id: orderId,
      transaction_id: `TX-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      status: "PAID",
      timestamp: new Date().toISOString()
    };

    console.log("[WEBHOOK] Payload bancario procesado con éxito:", webhookPayload);
    
    // Actualizar estado en el state manager en tiempo real
    if (this.stateManager && this.stateManager.updateOrderPaymentStatus) {
      this.stateManager.updateOrderPaymentStatus(orderId, "PAID", isSPEI ? "SPEI (STP)" : "PayByLink (Tarjeta)", webhookPayload.transaction_id);
    }

    return webhookPayload;
  }
}
