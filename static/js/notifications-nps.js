/**
 * Motor de Notificaciones Push & Retención (US-07) y Métricas de Éxito (KPIs Ágiles)
 * Ecosistema Sushi Erizo
 */

export class NotificationAndNPSModule {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.npsResponses = [
      { score: 10, comment: "Increíble sabor del Erizo Roll y llegó súper rápido.", orderId: "SE-910", date: "2026-08-23" },
      { score: 10, comment: "Excelente que respetaran mi indicación de sin pepino por alergia.", orderId: "SE-909", date: "2026-08-23" },
      { score: 9, comment: "El pago con SPEI fue instantáneo y facilísimo con la CLABE aislada.", orderId: "SE-905", date: "2026-08-22" },
      { score: 10, comment: "El menú en WhatsApp con Flows es el más cómodo que he usado.", orderId: "SE-902", date: "2026-08-22" }
    ];
  }

  /**
   * Genera los mensajes para los 4 touchpoints de notificación push en WhatsApp (US-07)
   * 1) Pago confirmado
   * 2) En preparación por el Chef
   * 3) En camino con repartidor
   * 4) Entrega completada
   */
  getPushMessageForStatus(order, status) {
    let text = "";
    let statusLabel = "";

    switch (status) {
      case "PAID":
      case "READY_TO_PREP":
        statusLabel = "Touchpoint 1: Pago Confirmado";
        text = `✅ *¡Pago Confirmado!* (Orden #${order.id})\nHemos recibido tu pago de *$${order.total} MXN*. Tu comanda ha entrado de inmediato a la barra de sushi.`;
        break;

      case "IN_PREPARATION":
        statusLabel = "Touchpoint 2: En Preparación";
        text = `👨‍🍳 *¡El Sushiman está preparando tu orden!* (#${order.id})\nTus rollos se están armando con ingredientes frescos y cuidando cada modificación.`;
        break;

      case "READY_FOR_DELIVERY":
        statusLabel = "Touchpoint 2.5: Empacado";
        text = `📦 *¡Tu pedido está listo y empacado!* (#${order.id})\nSello térmico de seguridad y ticket ESC/POS colocados. Asignando repartidor...`;
        break;

      case "OUT_FOR_DELIVERY":
        statusLabel = "Touchpoint 3: En Camino";
        const dest = order.address ? (order.address.street || 'tu domicilio') : 'tu ubicación';
        text = `🛵 *¡Tu pedido va en camino!* (#${order.id})\nEl repartidor se dirige a *${dest}*. Tiempo estimado: 15-20 min.`;
        break;

      case "DELIVERED":
        statusLabel = "Touchpoint 4: Entrega Completada";
        text = `🎉 *¡Pedido Entregado!* (#${order.id})\n¡Buen provecho! Esperamos que disfrutes cada bocado de tu sushi artesanal. 🍣`;
        break;

      default:
        text = `ℹ️ Actualización de tu pedido #${order.id}: estado ${status}.`;
    }

    return { text, statusLabel, status };
  }

  /**
   * Genera el mensaje interactivo de encuesta NPS (US-07)
   */
  getNPSSurveyPayload(orderId) {
    return {
      type: "nps_survey",
      orderId: orderId,
      title: "⭐ ¿Qué tal estuvo tu experiencia con Sushi Erizo?",
      text: "Del 1 al 10, ¿qué tan probable es que recomiendes Sushi Erizo a tus amigos y familiares?",
      scale: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    };
  }

  /**
   * Registra una respuesta de encuesta NPS
   */
  submitNPSResponse(orderId, score, comment = "") {
    const numericScore = parseInt(score, 10);
    const response = {
      orderId,
      score: numericScore,
      comment,
      date: new Date().toISOString()
    };
    this.npsResponses.push(response);
    return response;
  }

  /**
   * Calcula las Métricas de Éxito del Proyecto (KPIs Ágiles y de Negocio - Sección 4)
   */
  calculateKPIs(analyticsData = {}) {
    // 1. Conversión de Pedidos Iniciados (Objetivo >= 45%)
    const conversations = analyticsData.totalConversations || 135;
    const completedOrders = analyticsData.completedOrders || 64;
    const conversionRate = Math.min(100, ((completedOrders / conversations) * 100));

    // 2. Tasa de Abandono de Carrito (Objetivo < 20%)
    const initiatedCarts = analyticsData.initiatedCarts || 88;
    const abandonedCarts = analyticsData.abandonedCarts || 14;
    const cartAbandonmentRate = ((abandonedCarts / initiatedCarts) * 100);

    // 3. Tiempo de Respuesta del Bot (Objetivo < 1.5s)
    const avgResponseTimeMs = analyticsData.avgBotLatencyMs || 640; // ms

    // 4. Tasa de Error en Comandas de Cocina (Objetivo < 1%)
    const totalDishes = analyticsData.totalDishes || 380;
    const allergenMistakes = analyticsData.allergenMistakes || 1;
    const kitchenErrorRate = ((allergenMistakes / totalDishes) * 100);

    // 5. Cálculo NPS (Promoters 9-10 vs Detractors 1-6)
    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    let totalScore = 0;

    this.npsResponses.forEach(r => {
      totalScore += r.score;
      if (r.score >= 9) promoters++;
      else if (r.score >= 7) passives++;
      else detractors++;
    });

    const totalNPSCount = this.npsResponses.length || 1;
    const npsScore = Math.round(((promoters - detractors) / totalNPSCount) * 100);
    const avgRating = (totalScore / totalNPSCount).toFixed(1);

    return {
      conversionRate: conversionRate.toFixed(1),
      isConversionTargetMet: conversionRate >= 45,
      cartAbandonmentRate: cartAbandonmentRate.toFixed(1),
      isAbandonmentTargetMet: cartAbandonmentRate < 20,
      avgResponseTimeSec: (avgResponseTimeMs / 1000).toFixed(2),
      isLatencyTargetMet: avgResponseTimeMs < 1500,
      kitchenErrorRate: kitchenErrorRate.toFixed(2),
      isKitchenErrorTargetMet: kitchenErrorRate < 1.0,
      npsScore,
      avgRating,
      promotersCount: promoters,
      passivesCount: passives,
      detractorsCount: detractors,
      totalSurveys: this.npsResponses.length,
      storyPointsCompleted: 42,
      storyPointsTotal: 45,
      sprintsData: [
        { name: "Sprint 1: Core CUI & Flows", points: 14, status: "Completado", burndown: "100%" },
        { name: "Sprint 2: Checkout & KDS Tablet", points: 15, status: "Completado", burndown: "100%" },
        { name: "Sprint 3: ESC/POS & Retención NPS", points: 13, status: "Completado", burndown: "93%" }
      ]
    };
  }
}
