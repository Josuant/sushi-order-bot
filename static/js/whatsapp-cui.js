/**
 * Motor Conversacional WhatsApp CUI (Business API Simulator)
 * Implementa US-01 (Menú y Flows), US-02 (GPS y Mini-Flow) y US-03 (Fallback y Handoff)
 * Cumple con DoD: Microcopy < 200 caracteres por mensaje, botones <= 20 caracteres
 */
import { MENU_DATA } from './menu-data.js';

export class WhatsAppCUIEngine {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.consecutiveFailures = 0;
    this.isHumanHandoffActive = false;
    this.maxFailuresAllowed = 2; // Al 3er fallo consecutivo detona escalación a humano
    this.messageCharLimit = 200; // DoD < 200 caracteres
    this.buttonCharLimit = 20;  // DoD <= 20 caracteres
  }

  /**
   * Valida heurísticas DoD en los mensajes salientes
   */
  validateMicrocopy(text, buttons = []) {
    const isTextValid = text.length <= this.messageCharLimit;
    const areButtonsValid = buttons.every(b => (b.title || b.text || '').length <= this.buttonCharLimit);
    
    if (!isTextValid) {
      console.warn(`[DoD Microcopy Warning] Mensaje excede ${this.messageCharLimit} caracteres (${text.length} chars): "${text}"`);
    }
    if (!areButtonsValid) {
      buttons.forEach((btn, idx) => {
        const title = btn.title || btn.text || '';
        if (title.length > this.buttonCharLimit) {
          console.warn(`[DoD Button Warning] Botón ${idx + 1} excede ${this.buttonCharLimit} caracteres (${title.length} chars): "${title}"`);
        }
      });
    }

    return { isTextValid, areButtonsValid, textLength: text.length };
  }

  /**
   * Mensaje de Bienvenida y List Message de Categorías (US-01)
   * Microcopy: < 200 chars
   */
  getWelcomeMessage() {
    const text = "¡Hola! 🍣 Bienvenido a *Sushi Erizo*. Preparamos sushi artesanal directo a tu puerta.\n\n¿Qué se te antoja ordenar hoy?";
    const listMessage = {
      type: "list_message",
      buttonText: "📋 Ver Categorías",
      title: "Menú Sushi Erizo",
      sections: [
        {
          title: "Especialidades",
          rows: MENU_DATA.categories.map(cat => ({
            id: `cat_${cat.id}`,
            title: cat.title,
            description: cat.description.substring(0, 48) + "..."
          }))
        }
      ]
    };

    this.validateMicrocopy(text);
    return { text, listMessage };
  }

  /**
   * Obtiene la lista de platillos para una categoría seleccionada (US-01)
   * Microcopy: < 200 chars
   */
  getCategoryItemsMessage(categoryId) {
    const category = MENU_DATA.categories.find(c => c.id === categoryId);
    const items = MENU_DATA.items.filter(i => i.categoryId === categoryId);

    const text = `🥢 *${category ? category.title : 'Nuestros Platillos'}*\nElige tu favorito para personalizarlo con nuestro menú interactivo:`;
    
    const interactiveList = {
      type: "product_list",
      categoryId: categoryId,
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        price: `$${item.price} MXN`,
        badge: item.badge,
        desc: item.description,
        allergens: item.allergens.join(', ')
      }))
    };

    this.validateMicrocopy(text);
    return { text, interactiveList };
  }

  /**
   * Genera la carga del WhatsApp Flow para personalización de rollo (US-01)
   */
  getWhatsAppFlowPayload(itemId) {
    const item = MENU_DATA.items.find(i => i.id === itemId);
    if (!item) return null;

    return {
      type: "whatsapp_flow",
      flowId: "flow_sushi_customizer_v2",
      flowToken: `tok_${itemId}_${Date.now()}`,
      header: `🍣 Personaliza: ${item.name}`,
      item: item,
      exclusions: MENU_DATA.customizationOptions.exclusions,
      extras: MENU_DATA.customizationOptions.extras
    };
  }

  /**
   * Genera el mensaje interactivo location_request_message (US-02)
   * Microcopy: < 200 chars
   */
  getLocationRequestMessage() {
    const text = "📍 Para enviarte tu sushi fresquito y calcular tu ruta, ¿puedes compartirnos tu ubicación GPS actual?";
    const interactive = {
      type: "location_request_message",
      buttonText: "📍 Enviar Ubicación GPS"
    };

    this.validateMicrocopy(text);
    return { text, interactive };
  }

  /**
   * Mini-flow post GPS para número interior, piso y referencias visuales (US-02)
   */
  getAddressMiniFlowPayload(gpsData) {
    return {
      type: "address_mini_flow",
      gpsCoordinates: gpsData,
      formattedAddress: gpsData.street || gpsData.address || "Av. Insurgentes Sur 1450, CDMX",
      fields: [
        { id: "interior", label: "Número Interior / Depto / Piso", placeholder: "Ej. Depto 402, Piso 4", required: false },
        { id: "references", label: "Referencias Visuales (Fachada/Lobby)", placeholder: "Ej. Edificio blanco con lobby", required: true }
      ]
    };
  }

  /**
   * Botones de checkout rápido con límite estricto de 20 caracteres (DoD / US-01)
   */
  getCheckoutButtons(total) {
    const buttons = [
      { id: "pay_link", title: "💳 Pagar en Línea" },     // 17 chars (<= 20)
      { id: "pay_spei", title: "🏦 Pagar con SPEI" },     // 17 chars (<= 20)
      { id: "pay_cash", title: "💵 Contra Entrega" }      // 17 chars (<= 20)
    ];

    const text = `🛒 *Total a Pagar: $${total} MXN*\n\nSelecciona tu forma de pago preferida para comenzar la preparación:`;
    this.validateMicrocopy(text, buttons);

    return { text, buttons };
  }

  /**
   * Motor de NLP con detección de confianza, Fall-forward y Escalación Humana (US-03)
   */
  processNLPInput(userInput) {
    if (this.isHumanHandoffActive) {
      return {
        type: "human_chat",
        text: "Tu mensaje fue recibido por nuestro operador humano de Sushi Erizo."
      };
    }

    const inputLower = userInput.toLowerCase().trim();
    let intent = "unknown";
    let confidence = 0.2;

    // Clasificador de intenciones
    if (inputLower.includes("hola") || inputLower.includes("buenas") || inputLower.includes("menu") || inputLower.includes("menú") || inputLower.includes("carta") || inputLower.includes("empezar") || inputLower.includes("inicio")) {
      intent = "greeting_menu";
      confidence = 0.95;
    } else if (inputLower.includes("pedir") || inputLower.includes("ordenar") || inputLower.includes("sushi") || inputLower.includes("rollo") || inputLower.includes("erizo") || inputLower.includes("salmon") || inputLower.includes("salmón") || inputLower.includes("tuna") || inputLower.includes("maki")) {
      intent = "order_intent";
      confidence = 0.90;
    } else if (inputLower.includes("estado") || inputLower.includes("donde viene") || inputLower.includes("dónde viene") || inputLower.includes("mi pedido") || inputLower.includes("rastreo") || inputLower.includes("repartidor")) {
      intent = "track_order";
      confidence = 0.92;
    } else if (inputLower.includes("humano") || inputLower.includes("asesor") || inputLower.includes("persona") || inputLower.includes("operador") || inputLower.includes("ayuda") || inputLower.includes("chef")) {
      intent = "request_human";
      confidence = 0.98;
    } else if (inputLower.includes("pagar") || inputLower.includes("cuenta") || inputLower.includes("total") || inputLower.includes("cobro") || inputLower.includes("checkout")) {
      intent = "checkout";
      confidence = 0.88;
    }

    // Regla US-03: Baja confianza NLP (< 51%)
    if (confidence < 0.51) {
      this.consecutiveFailures++;
      console.log(`[NLP] Fallo detectado. Confianza: ${(confidence*100).toFixed(0)}%. Fallos consecutivos: ${this.consecutiveFailures}`);

      // Al 3er fallo consecutivo -> Escalación automática (Handoff)
      if (this.consecutiveFailures >= 3) {
        this.isHumanHandoffActive = true;
        if (this.stateManager && this.stateManager.triggerHandoff) {
          this.stateManager.triggerHandoff({
            reason: "Baja confianza de NLP consecutiva (3 fallos)",
            lastInput: userInput,
            consecutiveFailures: this.consecutiveFailures
          });
        }

        const handoffText = "👨‍🍳 No logré entenderte. Te he transferido con nuestro *operador humano* en barra. Tu carrito y conversación están listos.";
        this.validateMicrocopy(handoffText);

        return {
          type: "escalation_handoff",
          text: handoffText,
          handoffActive: true,
          failuresCount: this.consecutiveFailures
        };
      }

      // Sugerencias lógicas Fall-Forward (1er y 2do fallo)
      const suggestions = [
        { id: "suggest_menu", title: "📜 Ver el Menú" },     // 14 chars (<= 20)
        { id: "suggest_track", title: "🛵 Rastrear Pedido" }, // 18 chars (<= 20)
        { id: "suggest_human", title: "👤 Hablar con Chef" }  // 17 chars (<= 20)
      ];

      const cleanInputSample = userInput.length > 20 ? userInput.substring(0, 17) + '...' : userInput;
      const fallForwardText = `🤔 No comprendí "${cleanInputSample}". ¿Qué deseas hacer? (Intento ${this.consecutiveFailures}/2):`;
      this.validateMicrocopy(fallForwardText, suggestions);

      return {
        type: "fall_forward",
        text: fallForwardText,
        buttons: suggestions,
        failuresCount: this.consecutiveFailures
      };
    }

    // Si hubo éxito, reiniciar contador de fallos
    this.consecutiveFailures = 0;

    return {
      type: "intent_recognized",
      intent,
      confidence
    };
  }

  resetHandoff() {
    this.isHumanHandoffActive = false;
    this.consecutiveFailures = 0;
  }
}
