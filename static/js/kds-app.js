/**
 * Kitchen Display System (KDS) - Ecosistema Sushi Erizo
 * Optimizado para Operación en Cocina Táctil:
 * - 3 Columnas Activas (01 Nuevos, 02 En Preparación, 03 En Reparto) + Historial Entregados Colapsable
 * - SLAs Dinámicos con semáforo de tiempo (<8m Normal, 8-15m Alerta, >15m Urgente)
 * - Botones Táctiles Full-Width de Alta Visibilidad (mínimo 44px de altura táctil)
 * - Borde perimetral rojo para alérgenos (sin banners sobredimensionados)
 * - Repartidor asignado y ETA en etapa de reparto
 * - Origen del pedido (WhatsApp Bot 📱 vs Mostrador 🏪)
 */
import { MENU_DATA } from './menu-data.js';

export class KDSModule {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.timerInterval = null;
    this.initTimers();
  }

  initTimers() {
    if (typeof window === 'undefined') return;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.updateElapsedTimes();
    }, 3000);
  }

  COL_STYLES = {
    new:       { num: "01", label: "Nuevos Pedidos", bg: "#f0f6ff", accent: "#2563eb", border: "#93c5fd" },
    prep:      { num: "02", label: "En Preparación", bg: "#fffbeb", accent: "#d97706", border: "#fcd34d" },
    delivery:  { num: "03", label: "En Reparto",    bg: "#faf5ff", accent: "#7c3aed", border: "#c4b5fd" },
    delivered: { num: "04", label: "Entregados",    bg: "#f0fdf4", accent: "#16a34a", border: "#86efac" }
  };

  /**
   * Cálculo dinámico de SLA de cocina
   * < 8 mins: Normal (Verde/Neutro)
   * 8 - 14 mins: Alerta SLA (Naranja/Ámbar)
   * >= 15 mins: Urgente Crítico (Rojo Carmesí)
   */
  getSLAInfo(createdAt, targetMins = 12) {
    const elapsedMs = Math.max(0, Date.now() - new Date(createdAt).getTime());
    const mins = Math.floor(elapsedMs / 60000);
    const secs = Math.floor((elapsedMs % 60000) / 1000);
    
    let level = 'normal';
    let badgeText = `${mins}m`;
    let badgeClass = 'sla-normal';

    if (mins >= 15) {
      level = 'urgent';
      badgeText = `⚠️ ${mins}m • SLA CRÍTICO`;
      badgeClass = 'sla-urgent';
    } else if (mins >= 8) {
      level = 'warning';
      badgeText = `⏱️ ${mins}m • SLA ALERTA`;
      badgeClass = 'sla-warning';
    } else {
      badgeText = `⏱️ ${mins}m atrás`;
      badgeClass = 'sla-normal';
    }

    return {
      mins,
      secs,
      level,
      badgeText,
      badgeClass
    };
  }

  /**
   * Formatea los modificadores según las reglas estrictas de KDS (US-05):
   * - Críticos ("SIN", "ALERGIA") en negrita, cursiva y color rojo carmesí (#DC2626)
   * - Adiciones ("EXTRA") en verde wasabi (#10B981)
   */
  formatModifiersHTML(item) {
    let html = '';

    if (item.exclusions && item.exclusions.length > 0) {
      item.exclusions.forEach(exc => {
        const tagText = exc.tag || exc.label || 'MODIFICADOR';
        const isCritical = exc.isCritical || tagText.toUpperCase().includes('SIN') || tagText.toUpperCase().includes('ALERGIA');
        if (isCritical) {
          html += `<div class="kds-modifier-critical">⚠️ <em><strong>${tagText}</strong></em></div>`;
        } else {
          html += `<div class="kds-modifier-standard"><em>${tagText}</em></div>`;
        }
      });
    }

    if (item.extras && item.extras.length > 0) {
      item.extras.forEach(ext => {
        const tagText = ext.tag || ext.label || 'EXTRA';
        html += `<div class="kds-modifier-extra"><strong>+ ${tagText}</strong> ${ext.price ? `(+$${ext.price})` : ''}</div>`;
      });
    }

    if (item.kitchenNote) {
      html += `<div class="kds-modifier-note">📝 <em>"${item.kitchenNote}"</em></div>`;
    }

    return html;
  }

  getPriorityInfo(order) {
    const hasCritical = order.items.some(i => 
      i.exclusions && i.exclusions.some(e => e.isCritical || (e.tag && (e.tag.includes('ALERGIA') || e.tag.includes('SIN'))))
    );
    if (hasCritical) return { label: "ALTO", color: "#dc2626", bg: "#fee2e2" };
    if (order.total > 450) return { label: "MEDIO", color: "#d97706", bg: "#fef3c7" };
    return { label: "BAJO", color: "#4b5563", bg: "#f3f4f6" };
  }

  /**
   * Genera el indicador visual de acuse / palomitas de WhatsApp (US-07 & KDS Feedback)
   * - ⏳ pending_grace: En ventana de gracia (4s)
   * - ⏱️ sending: Despachando webhook
   * - ✓✓ gris: Entregado a servidores de WhatsApp (200 OK)
   * - ✓✓ azul: Leído / Recibido por el cliente
   * - ⚠️ rojo: Fallo de red (clic para reintentar)
   */
  renderReceiptBadge(order) {
    const st = order.waDeliveryStatus || 'read';
    if (st === 'pending_grace') {
      return `<span class="wa-receipt-indicator status-pending" id="wa-receipt-${order.id}" title="En cola de notificación (ventana de gracia 4s)">⏳</span>`;
    }
    if (st === 'sending') {
      return `<span class="wa-receipt-indicator status-sending" id="wa-receipt-${order.id}" title="Enviando a API de WhatsApp...">⏱️</span>`;
    }
    if (st === 'sent') {
      return `<span class="wa-receipt-indicator status-sent" id="wa-receipt-${order.id}" title="Entregado al servidor WhatsApp (200 OK)"><span class="wa-check">✓✓</span></span>`;
    }
    if (st === 'read') {
      return `<span class="wa-receipt-indicator status-read" id="wa-receipt-${order.id}" title="Mensaje entregado y leído por el cliente"><span class="wa-check wa-check-blue">✓✓</span></span>`;
    }
    if (st === 'error') {
      return `<span class="wa-receipt-indicator status-error" id="wa-receipt-${order.id}" title="Fallo al notificar. Clic para reintentar" onclick="event.stopPropagation(); window.ecosystemApp.retryWhatsAppPush('${order.id}')">⚠️ Reintentar</span>`;
    }
    return `<span class="wa-receipt-indicator status-read" id="wa-receipt-${order.id}"><span class="wa-check wa-check-blue">✓✓</span></span>`;
  }

  getOriginBadge(order) {
    if (order.paymentMethod && order.paymentMethod.includes("Terminal")) {
      return `<span class="kds-origin-badge origin-bar" title="Pedido en Mostrador / Barra">🏪 Barra</span>`;
    }
    const receiptHTML = this.renderReceiptBadge(order);
    return `<span class="kds-origin-badge origin-wa" title="Pedido Automatizado por WhatsApp Bot">📱 WhatsApp ${receiptHTML}</span>`;
  }

  /**
   * Renderiza la barra de progreso de la Ventana de Gracia (Debounce / Undo de 4s)
   */
  renderGraceBarHTML(order) {
    if (!order.graceUntil || order.graceUntil <= Date.now()) return '';
    const remainingSec = Math.max(1, Math.ceil((order.graceUntil - Date.now()) / 1000));
    return `
      <div class="kds-grace-undo-bar" id="kds-grace-bar-${order.id}">
        <div class="grace-bar-progress-track"></div>
        <div class="grace-bar-content">
          <span class="grace-bar-text">⏳ En cola de envío (${remainingSec}s)...</span>
          <button class="btn-grace-undo" onclick="event.stopPropagation(); window.ecosystemApp.undoOrderTransition('${order.id}')" title="Cancelar envío y revertir comanda">
            ↩️ Deshacer
          </button>
        </div>
      </div>
    `;
  }

  getNextStatus(status, colKey) {
    if (colKey === 'new' || status === 'PENDING' || status === 'READY_TO_PREP') {
      return 'IN_PREPARATION';
    }
    if (colKey === 'prep' || status === 'IN_PREPARATION') {
      return 'OUT_FOR_DELIVERY';
    }
    if (colKey === 'delivery' || status === 'OUT_FOR_DELIVERY' || status === 'READY_FOR_DELIVERY' || status === 'QC') {
      return 'DELIVERED';
    }
    return null;
  }

  getPrevStatus(status, colKey) {
    if (colKey === 'delivered' || status === 'DELIVERED') {
      return 'OUT_FOR_DELIVERY';
    }
    if (colKey === 'delivery' || status === 'OUT_FOR_DELIVERY' || status === 'READY_FOR_DELIVERY' || status === 'QC') {
      return 'IN_PREPARATION';
    }
    if (colKey === 'prep' || status === 'IN_PREPARATION') {
      return 'READY_TO_PREP';
    }
    return null;
  }

  getSwipeInfo(order, colKey) {
    const nextStatus = this.getNextStatus(order.status, colKey);
    const prevStatus = this.getPrevStatus(order.status, colKey);

    let nextInfo = null;
    let prevInfo = null;

    if (nextStatus === 'IN_PREPARATION') {
      nextInfo = { col: '02 Barra', text: 'Iniciar en Barra', icon: '▶' };
    } else if (nextStatus === 'OUT_FOR_DELIVERY') {
      nextInfo = { col: '03 Reparto', text: 'Despachar a Reparto', icon: '🛵' };
    } else if (nextStatus === 'DELIVERED') {
      nextInfo = { col: '04 Entregado', text: 'Confirmar Entrega', icon: '🏁' };
    }

    if (prevStatus === 'READY_TO_PREP') {
      prevInfo = { col: '01 Nuevos', text: 'Devolver a Nuevos', icon: '↶' };
    } else if (prevStatus === 'IN_PREPARATION') {
      prevInfo = { col: '02 Barra', text: 'Devolver a Cocina', icon: '↶' };
    } else if (prevStatus === 'OUT_FOR_DELIVERY') {
      prevInfo = { col: '03 Reparto', text: 'Reabrir Reparto', icon: '↶' };
    }

    return { nextStatus, prevStatus, nextInfo, prevInfo };
  }

  /**
   * Renderiza una comanda individual optimizada para gestos táctiles (Swipe):
   * - Borde rojo perimetral grueso en caso de alergia (sin banners gigantescos)
   * - Deslizar a la derecha: Avanza a la siguiente etapa de columna
   * - Deslizar a la izquierda: Retrocede a la etapa anterior
   * - Testigo visual de estado WhatsApp (reloj, palomitas gris/azul, error)
   * - Barra de gracia (Undo / Debounce) de 4 segundos con animación
   */
  renderTicketCard(order, colKey) {
    const style = this.COL_STYLES[colKey] || this.COL_STYLES.new;
    const sla = this.getSLAInfo(order.createdAt);
    const priority = this.getPriorityInfo(order);
    const originBadge = this.getOriginBadge(order);
    const { nextStatus, prevStatus, nextInfo, prevInfo } = this.getSwipeInfo(order, colKey);

    const hasCriticalAllergens = order.items.some(i => 
      i.exclusions && i.exclusions.some(e => e.isCritical || (e.tag && (e.tag.includes('ALERGIA') || e.tag.includes('SIN'))))
    );

    // Lista de ítems compacta
    const itemsHTML = order.items.map((item, idx) => {
      const modHTML = this.formatModifiersHTML(item);
      return `
        <div class="kds-roll-row">
          <div class="kds-roll-topline">
            <span class="kds-roll-qty">×${item.quantity || 1}</span>
            <span class="kds-roll-title">${item.name}</span>
            <button class="btn-recipe-compact" onclick="window.ecosystemApp.openRecipePanel('${order.id}', ${idx})" title="Ver receta">
              🔍 Receta
            </button>
          </div>
          ${modHTML ? `<div class="kds-item-mods-compact">${modHTML}</div>` : ''}
        </div>
      `;
    }).join('');

    // Datos del Repartidor & ETA en columna En Reparto
    let driverInfoHTML = '';
    if (colKey === 'delivery') {
      const driverName = order.driverName || 'Alex Moto #4';
      const etaTime = order.deliveryETA || '~12 min';
      driverInfoHTML = `
        <div class="kds-driver-box">
          <div class="driver-lead">🛵 <strong>${driverName}</strong> • <span class="driver-eta">ETA: ${etaTime}</span></div>
          <div class="driver-dest">📍 ${order.address ? order.address.street : 'Domicilio cliente'}</div>
        </div>
      `;
    }

    // Barra de Ventana de Gracia si está activa
    const graceBarHTML = this.renderGraceBarHTML(order);

    // Clases especiales de tarjeta
    const allergyCardClass = hasCriticalAllergens ? 'kds-card-allergy-border' : '';
    const urgentCardClass = sla.level === 'urgent' ? 'kds-card-sla-urgent' : '';

    return `
      <div 
        class="kds-compact-card ${allergyCardClass} ${urgentCardClass}" 
        id="kds-card-${order.id}"
        data-order-id="${order.id}"
        data-col-key="${colKey}"
        data-status="${order.status}"
      >
        
        <!-- Overlay dinámico de feedback Swipe en arrastre -->
        <div class="kds-swipe-action-overlay" id="swipe-overlay-${order.id}">
          ${nextStatus && nextInfo ? `
            <div class="swipe-cue swipe-cue-right">
              <span class="swipe-cue-icon">${nextInfo.icon}</span>
              <span class="swipe-cue-text">${nextInfo.text}</span>
              <span class="swipe-cue-arrow">➔</span>
            </div>
          ` : ''}
          ${prevStatus && prevInfo ? `
            <div class="swipe-cue swipe-cue-left">
              <span class="swipe-cue-arrow">↶</span>
              <span class="swipe-cue-text">${prevInfo.text}</span>
              <span class="swipe-cue-icon">${prevInfo.icon}</span>
            </div>
          ` : ''}
        </div>

        <!-- Cabecera de la tarjeta condensada -->
        <div class="kds-card-header-compact">
          <div class="kds-header-primary">
            <div class="kds-order-code">
              <span class="kds-id-pill">#${order.id}</span>
              <strong class="kds-cust-name">${order.customerName}</strong>
            </div>
            <div class="kds-badges-row">
              ${originBadge}
              <span class="kds-sla-badge ${sla.badgeClass}" data-created-at="${order.createdAt}">
                ${sla.badgeText}
              </span>
              <span class="kds-prio-tag" style="color: ${priority.color}; background: ${priority.bg};">
                ${priority.label}
              </span>
            </div>
          </div>

          <div class="kds-header-tools">
            ${hasCriticalAllergens ? `
              <span class="alert-icon-pulse" title="Alerta Crítica de Alérgenos">🚨</span>
            ` : ''}
            <button class="btn-card-print-sm" title="Imprimir Ticket Térmico" onclick="window.ecosystemApp.openPrintModal('${order.id}')">
              🖨️
            </button>
          </div>
        </div>

        <!-- Lista de Rollos -->
        <div class="kds-card-items-wrap">
          ${itemsHTML}
        </div>

        <!-- Info de Repartidor si aplica -->
        ${driverInfoHTML}

        <!-- Barra de Ventana de Gracia (Debounce / Undo) -->
        ${graceBarHTML}

      </div>
    `;
  }

  /**
   * Renderiza el tablero Kanban en pantalla activa (3 Columnas Operativas + Drawer Entregados)
   */
  renderKDSBoard(orders) {
    if (typeof document === 'undefined') return;

    const colNew = document.getElementById('kds-col-new');
    const colPrep = document.getElementById('kds-col-prep');
    const colDelivery = document.getElementById('kds-col-delivery');
    const colDelivered = document.getElementById('kds-col-delivered-drawer');

    const newOrders = orders.filter(o => o.status === 'PENDING' || o.status === 'READY_TO_PREP');
    const prepOrders = orders.filter(o => o.status === 'IN_PREPARATION');
    const deliveryOrders = orders.filter(o => o.status === 'OUT_FOR_DELIVERY' || o.status === 'READY_FOR_DELIVERY' || o.status === 'QC');
    const deliveredOrders = orders.filter(o => o.status === 'DELIVERED');

    if (colNew) {
      colNew.innerHTML = newOrders.length > 0
        ? newOrders.map(o => this.renderTicketCard(o, 'new')).join('')
        : `<div class="kds-empty-col"><span style="font-size:1.5rem">+</span>Sin nuevos pedidos</div>`;
    }

    if (colPrep) {
      colPrep.innerHTML = prepOrders.length > 0
        ? prepOrders.map(o => this.renderTicketCard(o, 'prep')).join('')
        : `<div class="kds-empty-col"><span style="font-size:1.5rem">🍣</span>Barra libre para preparar</div>`;
    }

    if (colDelivery) {
      colDelivery.innerHTML = deliveryOrders.length > 0
        ? deliveryOrders.map(o => this.renderTicketCard(o, 'delivery')).join('')
        : `<div class="kds-empty-col"><span style="font-size:1.5rem">🛵</span>Sin repartos en ruta</div>`;
    }

    if (colDelivered) {
      colDelivered.innerHTML = deliveredOrders.length > 0
        ? deliveredOrders.map(o => this.renderTicketCard(o, 'delivered')).join('')
        : `<div class="kds-empty-col" style="padding:2rem;"><span style="font-size:1.5rem">📁</span>Sin pedidos archivados hoy</div>`;
    }

    // Actualizar contadores
    const elCountNew = document.getElementById('kds-count-new');
    const elCountPrep = document.getElementById('kds-count-prep');
    const elCountDelivery = document.getElementById('kds-count-delivery');
    const elCountDelivered = document.getElementById('kds-count-delivered-btn');

    if (elCountNew) elCountNew.textContent = newOrders.length;
    if (elCountPrep) elCountPrep.textContent = prepOrders.length;
    if (elCountDelivery) elCountDelivery.textContent = deliveryOrders.length;
    if (elCountDelivered) elCountDelivered.textContent = deliveredOrders.length;

    // Badges circulares de cabecera de columna
    const elBadgeNew = document.getElementById('kds-count-new-badge');
    const elBadgePrep = document.getElementById('kds-count-prep-badge');
    const elBadgeDelivery = document.getElementById('kds-count-delivery-badge');

    if (elBadgeNew) elBadgeNew.textContent = newOrders.length;
    if (elBadgePrep) elBadgePrep.textContent = prepOrders.length;
    if (elBadgeDelivery) elBadgeDelivery.textContent = deliveryOrders.length;

    // Actualizar badge del header
    const activeTotal = newOrders.length + prepOrders.length + deliveryOrders.length;
    const tabBadge = document.getElementById('badge-active-orders');
    if (tabBadge) tabBadge.textContent = activeTotal;

    // Conectar gestos de deslizamiento táctil a todas las tarjetas renderizadas
    this.attachSwipeGestures();
  }

  /**
   * Mapea un status de destino a su columna DOM correspondiente
   */
  getTargetColElement(targetStatus) {
    if (typeof document === 'undefined') return null;
    if (targetStatus === 'IN_PREPARATION') return document.getElementById('kds-col-prep');
    if (targetStatus === 'OUT_FOR_DELIVERY') return document.getElementById('kds-col-delivery');
    if (targetStatus === 'DELIVERED') return document.getElementById('kds-col-delivered-drawer');
    if (targetStatus === 'READY_TO_PREP' || targetStatus === 'PENDING') return document.getElementById('kds-col-new');
    return null;
  }

  /**
   * Mapea un status de destino a la columna kanban padre (.kds-kanban-col)
   */
  getTargetKanbanCol(targetStatus) {
    const container = this.getTargetColElement(targetStatus);
    if (!container) return null;
    return container.closest('.kds-kanban-col');
  }

  /**
   * Inserta un placeholder animado de drop-zone en la columna destino
   */
  showDropZone(targetStatus, direction, reached, cardHeight) {
    const container = this.getTargetColElement(targetStatus);
    if (!container) return null;

    // Si la columna está vacía (tiene el placeholder de vacío), ocultarlo temporalmente
    const emptyNotice = container.querySelector('.kds-empty-col');
    if (emptyNotice) emptyNotice.style.display = 'none';

    let placeholder = container.querySelector('.kds-drop-zone-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = `kds-drop-zone-placeholder${direction === 'prev' ? ' drop-prev' : ''}`;
      if (cardHeight) {
        placeholder.style.minHeight = `${Math.min(140, Math.max(80, cardHeight * 0.75))}px`;
      }
      const label = direction === 'prev' ? '↶ Ubicación en esta columna' : '➔ Ubicación en esta columna';
      placeholder.innerHTML = `<span class="drop-zone-shimmer"></span><span>${label}</span>`;
      container.appendChild(placeholder);

      const kanbanCol = this.getTargetKanbanCol(targetStatus);
      if (kanbanCol) kanbanCol.classList.add('col-drop-target');
    }

    if (reached) {
      placeholder.classList.add('drop-reached');
    } else {
      placeholder.classList.remove('drop-reached');
    }

    return placeholder;
  }

  /**
   * Elimina todos los placeholders de drop-zone y clases auxiliares
   */
  clearDropZones() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.kds-empty-col').forEach(el => {
      el.style.display = '';
    });
    document.querySelectorAll('.kds-drop-zone-placeholder').forEach(el => {
      el.remove();
    });
    document.querySelectorAll('.col-drop-target').forEach(el => el.classList.remove('col-drop-target'));
    document.querySelectorAll('.col-swiping-source').forEach(el => el.classList.remove('col-swiping-source'));
    const grid = document.querySelector('.kds-columns-grid-3');
    if (grid) grid.classList.remove('has-swiping-card');
  }

  /**
   * Configura la interacción táctil y de ratón (Swipe Gestures) en todas las comandas:
   * - Soporta touch (tablets/iPad/Android) y pointer (ratón en escritorio)
   * - Permite pan-y para scroll vertical suave sin falsos disparos
   * - Feedback visual dinámico con rotación, brillo de color y escalado de píldora
   * - Resistencia progresiva tangencial hiperbólica hasta detenerse en el carril inmediato
   * - Convergencia al punto dulce y encaje perfecto al final de la fila del carril destino
   */
  attachSwipeGestures() {
    if (typeof document === 'undefined') return;
    const cards = document.querySelectorAll('.kds-compact-card[data-order-id]');

    cards.forEach(card => {
      const orderId = card.getAttribute('data-order-id');
      const colKey = card.getAttribute('data-col-key');
      const status = card.getAttribute('data-status');

      let startX = 0;
      let startY = 0;
      let deltaX = 0;
      let deltaY = 0;
      let isDragging = false;
      let isHorizontal = false;
      let dropZoneShown = null; // 'next' | 'prev' | null
      const threshold = 75; // Píxeles necesarios para confirmar transición

      const onPointerDown = (e) => {
        // Ignorar si el toque se originó en un botón interactivo (ej. Ver Receta o Imprimir)
        if (e.target.closest('button, a, input, select')) return;

        startX = e.clientX;
        startY = e.clientY;
        deltaX = 0;
        deltaY = 0;
        isDragging = true;
        isHorizontal = false;
        dropZoneShown = null;

        try {
          card.setPointerCapture(e.pointerId);
        } catch (err) {}

        card.classList.add('card-touch-active');
        card.style.transition = 'none';

        card.addEventListener('pointermove', onPointerMove);
        card.addEventListener('pointerup', onPointerUp);
        card.addEventListener('pointercancel', onPointerCancel);
      };

      const onPointerMove = (e) => {
        if (!isDragging) return;

        deltaX = e.clientX - startX;
        deltaY = e.clientY - startY;

        // Detección de intención direccional
        if (!isHorizontal) {
          if (Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
            isHorizontal = true;

            // Capturar posición y tamaño antes de cambiar a fixed
            const rect = card.getBoundingClientRect();
            card._origTop = rect.top;
            card._origLeft = rect.left;
            card._origWidth = rect.width;
            card._origHeight = rect.height;

            // Pinchar como fixed en su posición exacta para escapar overflow:hidden
            card.style.width = rect.width + 'px';
            card.style.top = rect.top + 'px';
            card.style.left = rect.left + 'px';
            card.classList.add('is-swiping');

            // Marcar contenedores fuente para drop-zone
            const grid = document.querySelector('.kds-columns-grid-3');
            if (grid) grid.classList.add('has-swiping-card');
            const sourceCol = card.closest('.kds-kanban-col');
            if (sourceCol) sourceCol.classList.add('col-swiping-source');
          } else if (Math.abs(deltaY) > 10) {
            // Intención de scroll vertical en la tablet
            cleanup(e);
            return;
          }
        }

        if (isHorizontal) {
          e.preventDefault();

          const nextStatus = this.getNextStatus(status, colKey);
          const prevStatus = this.getPrevStatus(status, colKey);

          const hasTarget = (deltaX > 0 && nextStatus) || (deltaX < 0 && prevStatus);
          const absDx = Math.abs(deltaX);
          const sign = Math.sign(deltaX);

          let effectiveDx = 0;
          if (hasTarget) {
            // Desplazamiento exclusivo hacia el carril inmediato con resistencia tangencial
            const maxExtra = 70;
            if (absDx <= threshold) {
              effectiveDx = deltaX;
            } else {
              const extra = absDx - threshold;
              const dampedExtra = maxExtra * Math.tanh(extra / (maxExtra * 0.75));
              effectiveDx = sign * (threshold + dampedExtra);
            }
          } else {
            // Si no hay carril adyacente: tope elástico inmediato de 28px
            const maxBounce = 28;
            effectiveDx = sign * (maxBounce * Math.tanh(absDx / 45));
          }

          // Activación y actualización de la drop-zone
          const targetStatus = deltaX > 0 ? nextStatus : prevStatus;
          const direction = deltaX > 0 ? 'next' : 'prev';

          if (targetStatus && Math.abs(deltaX) > 12) {
            if (dropZoneShown !== direction) {
              this.clearDropZones();
              dropZoneShown = direction;
            }
            this.showDropZone(targetStatus, direction, Math.abs(deltaX) >= threshold, card._origHeight);
          } else if (dropZoneShown) {
            this.clearDropZones();
            dropZoneShown = null;
          }

          // Punto dulce (Sweet Spot): alineación vertical progresiva con la fila destino
          let sweetSpotY = 0;
          if (targetStatus && Math.abs(deltaX) >= threshold) {
            const targetContainer = this.getTargetColElement(targetStatus);
            const placeholder = targetContainer ? targetContainer.querySelector('.kds-drop-zone-placeholder') : null;
            if (placeholder) {
              const phRect = placeholder.getBoundingClientRect();
              const targetDeltaY = phRect.top - card._origTop;
              // Convergencia progresiva suave hacia el slot vertical al llegar al punto dulce
              const progress = Math.min(1, (absDx - threshold) / 50);
              sweetSpotY = targetDeltaY * (progress * 0.45);
            }
          }

          const progressSweet = Math.min(1, Math.max(0, (absDx - threshold) / 50));
          const rotation = effectiveDx * 0.032 * (1 - progressSweet * 0.6); // Se endereza suavemente al llegar al punto dulce

          card.style.transform = `translate3d(${effectiveDx}px, ${sweetSpotY}px, 0) rotate(${rotation}deg)`;

          // Overlays de avance o retroceso
          const rightCue = card.querySelector('.swipe-cue-right');
          const leftCue = card.querySelector('.swipe-cue-left');

          if (effectiveDx > 0 && nextStatus) {
            if (rightCue) {
              const progress = Math.min(1, effectiveDx / threshold);
              rightCue.style.opacity = progress.toString();
              rightCue.style.transform = `translateY(-50%) scale(${0.85 + progress * 0.25})`;
              if (effectiveDx >= threshold) {
                rightCue.classList.add('cue-reached');
              } else {
                rightCue.classList.remove('cue-reached');
              }
            }
            if (leftCue) leftCue.style.opacity = '0';
            card.style.borderColor = effectiveDx >= threshold ? '#22c55e' : '#93c5fd';
            card.style.boxShadow = `0 12px 30px rgba(37, 99, 235, ${Math.min(0.3, effectiveDx / 220)})`;

          } else if (effectiveDx < 0 && prevStatus) {
            if (leftCue) {
              const progress = Math.min(1, Math.abs(effectiveDx) / threshold);
              leftCue.style.opacity = progress.toString();
              leftCue.style.transform = `translateY(-50%) scale(${0.85 + progress * 0.25})`;
              if (Math.abs(effectiveDx) >= threshold) {
                leftCue.classList.add('cue-reached');
              } else {
                leftCue.classList.remove('cue-reached');
              }
            }
            if (rightCue) rightCue.style.opacity = '0';
            card.style.borderColor = Math.abs(effectiveDx) >= threshold ? '#f59e0b' : '#fcd34d';
            card.style.boxShadow = `0 12px 30px rgba(217, 119, 6, ${Math.min(0.3, Math.abs(effectiveDx) / 220)})`;

          } else {
            if (rightCue) rightCue.style.opacity = '0';
            if (leftCue) leftCue.style.opacity = '0';
          }
        }
      };

      const cleanup = (e) => {
        isDragging = false;
        isHorizontal = false;
        dropZoneShown = null;
        card.classList.remove('card-touch-active', 'is-swiping');
        card.style.borderColor = '';
        card.style.boxShadow = '';
        card.style.top = '';
        card.style.left = '';
        card.style.width = '';

        try {
          if (e && e.pointerId) card.releasePointerCapture(e.pointerId);
        } catch (err) {}

        card.removeEventListener('pointermove', onPointerMove);
        card.removeEventListener('pointerup', onPointerUp);
        card.removeEventListener('pointercancel', onPointerCancel);

        const rightCue = card.querySelector('.swipe-cue-right');
        const leftCue = card.querySelector('.swipe-cue-left');
        if (rightCue) rightCue.style.opacity = '0';
        if (leftCue) leftCue.style.opacity = '0';

        // Limpiar overflow y drop-zones
        this.clearDropZones();
      };

      const onPointerUp = (e) => {
        if (!isDragging) return;

        const nextStatus = this.getNextStatus(status, colKey);
        const prevStatus = this.getPrevStatus(status, colKey);
        const isForward = deltaX >= threshold && nextStatus;
        const isBackward = deltaX <= -threshold && prevStatus;

        if (isForward || isBackward) {
          const targetStatus = isForward ? nextStatus : prevStatus;
          const targetContainer = this.getTargetColElement(targetStatus);
          const placeholder = targetContainer ? targetContainer.querySelector('.kds-drop-zone-placeholder') : null;

          let destX = 0;
          let destY = 0;
          let destWidth = card._origWidth;

          if (placeholder) {
            const phRect = placeholder.getBoundingClientRect();
            destX = phRect.left - card._origLeft;
            destY = phRect.top - card._origTop;
            destWidth = phRect.width;
          } else if (targetContainer) {
            const colRect = targetContainer.getBoundingClientRect();
            destX = colRect.left - card._origLeft;
            destY = (colRect.bottom - (card._origHeight || card.offsetHeight) - 8) - card._origTop;
            destWidth = colRect.width;
          }

          // Animación suave de aterrizaje y encaje perfecto en el final de la fila del otro carril
          card.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.95, 0.35, 1), width 0.28s ease, box-shadow 0.25s ease, border-color 0.25s ease';
          card.style.transform = `translate3d(${destX}px, ${destY}px, 0) rotate(0deg)`;
          card.style.borderColor = isForward ? '#22c55e' : '#f59e0b';
          card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
          if (destWidth) card.style.width = `${destWidth}px`;

          // Ocultar cues mientras se alinea
          const rightCue = card.querySelector('.swipe-cue-right');
          const leftCue = card.querySelector('.swipe-cue-left');
          if (rightCue) rightCue.style.opacity = '0';
          if (leftCue) leftCue.style.opacity = '0';

          if (navigator.vibrate) {
            try { navigator.vibrate([15, 30, 15]); } catch (v) {}
          }

          setTimeout(() => {
            cleanup(e);
            if (window.ecosystemApp) {
              window.ecosystemApp.transitionOrderStatus(orderId, targetStatus);
            }
          }, 260);

        } else {
          // Rebote elástico si no alcanzó el umbral o no hay destino
          card.style.transition = 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.25s ease, border-color 0.25s ease';
          card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
          card.style.boxShadow = '';
          card.style.borderColor = '';

          setTimeout(() => {
            cleanup(e);
          }, 260);
        }
      };

      const onPointerCancel = (e) => {
        card.style.transition = 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s ease';
        card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
        card.style.opacity = '1';
        setTimeout(() => {
          cleanup(e);
        }, 260);
      };

      card.addEventListener('pointerdown', onPointerDown);
    });
  }

  /**
   * Abre el panel lateral deslizante de receta (Recipe Slide-out Panel)
   */
  openRecipePanel(order, itemIndex) {
    const item = order.items[itemIndex];
    if (!item) return;

    const menuItem = MENU_DATA.items.find(i => i.id === item.id) || MENU_DATA.items[0];
    const baseIngredients = menuItem.recipeIngredients || [
      { name: "Arroz sumeshi", amount: "120 g" },
      { name: "Hoja de nori", amount: "1 hoja" },
      { name: "Salmón / Atún fresco", amount: "60 g" },
      { name: "Aguacate Hass", amount: "40 g" },
      { name: "Pepino fresco", amount: "30 g" }
    ];

    const steps = menuItem.steps || [
      { step: 1, instruction: "Extender arroz sobre alga nori uniformemente." },
      { step: 2, instruction: "Colocar ingredientes en el centro cuidando modificaciones." },
      { step: 3, instruction: "Enrollar con esterilla firme y cortar en piezas limpias." }
    ];

    const exclusionNames = (item.exclusions || []).map(e => (e.tag || e.label || '').toUpperCase());
    const extraNames = (item.extras || []).map(e => (e.tag || e.label || '').toUpperCase());

    const ingredientsHTML = baseIngredients.map(ing => {
      const isExcluded = exclusionNames.some(ex => ex.includes(ing.name.toUpperCase()) || (ing.name.toLowerCase().includes('pepino') && exclusionNames.some(e => e.includes('PEPINO'))));
      return `
        <li class="recipe-ing-row ${isExcluded ? 'ing-excluded' : ''}">
          <span class="ing-name">
            ${isExcluded ? '🚫 ' : '🥢 '}${ing.name}
          </span>
          <span class="ing-amount">
            ${isExcluded ? 'OMITIR' : ing.amount}
          </span>
        </li>
      `;
    }).join('');

    const extrasListHTML = (item.extras || []).map(ext => `
      <li class="recipe-ing-row ing-added">
        <span class="ing-name">✨ + ${ext.tag || ext.label}</span>
        <span class="ing-amount">ADICIÓN</span>
      </li>
    `).join('');

    const stepsHTML = steps.map(s => {
      let instr = s.instruction;
      if (exclusionNames.length > 0) {
        exclusionNames.forEach(ex => {
          if (ex.includes('PEPINO') && instr.toLowerCase().includes('pepino')) {
            instr = `<strong>OMITIR PEPINO:</strong> ` + instr.replace(/pepino/gi, '<del>pepino</del>');
          }
        });
      }
      return `
        <li class="recipe-step-item">
          <span class="step-num">${s.step}</span>
          <span class="step-text">${instr}</span>
        </li>
      `;
    }).join('');

    const panel = document.getElementById('recipe-slideout-panel');
    const content = document.getElementById('recipe-panel-content');

    if (content) {
      content.innerHTML = `
        <div class="recipe-header">
          <div>
            <div class="recipe-order-tag">#${order.id} • RECETA DE COCINA</div>
            <h3 class="recipe-title">${item.name}</h3>
            <div class="recipe-sub-bar">
              <span class="recipe-qty-pill">🍣 ×${item.quantity || 1} unidades</span>
              <span class="recipe-time-pill">⏱️ ${menuItem.prepMins || 8} min preparación</span>
            </div>
          </div>
          <button class="recipe-close-btn" onclick="window.ecosystemApp.closeRecipePanel()">✕</button>
        </div>

        ${(item.exclusions && item.exclusions.length > 0) ? `
          <div class="recipe-allergy-alert">
            <span class="alert-icon-pulse" style="font-size: 1.25rem;">🚨</span>
            <div>
              <strong style="color: #dc2626; font-size: 0.78rem; text-transform: uppercase;">Exclusiones / Alérgenos Críticos</strong>
              <p style="color: #7f1d1d; font-size: 0.82rem; margin-top: 0.15rem;">
                ${item.exclusions.map(e => `<strong>${e.tag || e.label}</strong>`).join(' • ')}
              </p>
            </div>
          </div>
        ` : ''}

        ${item.kitchenNote ? `
          <div class="recipe-note-alert">
            <span>📝</span>
            <span>Nota del Sushiman: <em>"${item.kitchenNote}"</em></span>
          </div>
        ` : ''}

        <div class="recipe-body">
          <div class="recipe-section">
            <h4 class="recipe-section-title">INGREDIENTES & GRAMAJES</h4>
            <ul class="recipe-ing-list">
              ${ingredientsHTML}
              ${extrasListHTML}
            </ul>
          </div>

          <div class="recipe-section">
            <h4 class="recipe-section-title">PASOS DE PREPARACIÓN</h4>
            <ol class="recipe-steps-list">
              ${stepsHTML}
            </ol>
          </div>
        </div>

        <div class="recipe-footer">
          <button class="kds-touch-action-btn btn-action-start" style="width: 100%;" onclick="window.ecosystemApp.closeRecipePanel()">
            ✓ ENTENDIDO, CERRAR RECETA
          </button>
        </div>
      `;
    }

    if (panel) panel.style.display = 'block';
  }

  closeRecipePanel() {
    const panel = document.getElementById('recipe-slideout-panel');
    if (panel) panel.style.display = 'none';
  }

  updateElapsedTimes() {
    if (typeof document === 'undefined') return;
    const badges = document.querySelectorAll('.kds-sla-badge');
    badges.forEach(badge => {
      const createdAt = badge.getAttribute('data-created-at');
      if (createdAt) {
        const sla = this.getSLAInfo(createdAt);
        badge.className = `kds-sla-badge ${sla.badgeClass}`;
        badge.textContent = sla.badgeText;
      }
    });
  }
}
