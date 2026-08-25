/**
 * Módulo de Impresión Térmica ESC/POS (80mm) y Etiquetas Adhesivas
 * Ecosistema Sushi Erizo - US-06
 * Incluye soporte de video inverso monocromático para modificaciones críticas
 */

export class ThermalPrinterModule {
  constructor() {
    this.printHistory = [];
  }

  /**
   * Genera el contenido HTML / ESC-POS de la comanda térmica de recibo (80mm)
   * Cumple con US-06: Video inverso monocromático para modificaciones críticas
   */
  generateReceiptHTML(order) {
    if (!order) return '<div class="escpos-ticket">Seleccione una orden para imprimir.</div>';

    const dateStr = new Date(order.createdAt).toLocaleString('es-MX', {
      dateStyle: 'short',
      timeStyle: 'medium'
    });

    const itemsHTML = (order.items || []).map(item => {
      const hasCritical = item.exclusions && item.exclusions.some(e => e.isCritical || (e.tag && (e.tag.includes('ALERGIA') || e.tag.includes('SIN'))));
      
      let criticalBlock = '';
      if (hasCritical) {
        const critText = item.exclusions.map(e => e.tag || e.label).join(' | ');
        criticalBlock = `
          <div class="escpos-reverse-video">
            *** ATENCIÓN CRÍTICA: ${critText.toUpperCase()} ***
          </div>
        `;
      }

      let extrasBlock = '';
      if (item.extras && item.extras.length > 0) {
        extrasBlock = `
          <div class="escpos-extras">
            + ${item.extras.map(e => `${e.tag || e.label} (+$${e.price || 0})`).join('<br>+ ')}
          </div>
        `;
      }

      let notesBlock = '';
      if (item.kitchenNote) {
        notesBlock = `
          <div class="escpos-note">
            * NOTA CHEF: "${item.kitchenNote}"
          </div>
        `;
      }

      return `
        <div class="escpos-item-row">
          <div class="escpos-item-header">
            <span class="escpos-qty">${item.quantity || 1}x</span>
            <span class="escpos-item-name">${item.name}</span>
            <span class="escpos-item-price">$${(item.price || 0) * (item.quantity || 1)}</span>
          </div>
          ${criticalBlock}
          ${extrasBlock}
          ${notesBlock}
        </div>
      `;
    }).join('');

    return `
      <div class="escpos-ticket 80mm" id="printable-escpos-ticket">
        <div class="escpos-header text-center">
          <div class="escpos-logo-text">*** SUSHI ERIZO ***</div>
          <div class="escpos-sub">Venta Directa Conversacional WhatsApp</div>
          <div class="escpos-divider">================================</div>
          <div class="escpos-meta">
            <div><strong>ORDEN: #${order.id}</strong></div>
            <div>FECHA: ${dateStr}</div>
            <div>CLIENTE: ${order.customerName}</div>
            <div>TEL: ${order.customerPhone || '+52 55 **** 1188'}</div>
            <div>CANAL: <strong>WHATSAPP CUI BUSINESS</strong></div>
          </div>
          <div class="escpos-divider">--------------------------------</div>
        </div>

        <div class="escpos-body">
          <div class="escpos-col-headers">
            <span>CANT / DESCRIPCIÓN</span>
            <span>IMPORTE</span>
          </div>
          <div class="escpos-divider">--------------------------------</div>
          ${itemsHTML}
        </div>

        <div class="escpos-divider">================================</div>
        
        <div class="escpos-totals">
          <div class="escpos-total-row">
            <span>SUBTOTAL:</span>
            <span>$${order.subtotal || order.total - (order.deliveryFee || 35)} MXN</span>
          </div>
          <div class="escpos-total-row">
            <span>COSTO ENVÍO GPS:</span>
            <span>$${order.deliveryFee || 35} MXN</span>
          </div>
          <div class="escpos-total-row grand-total">
            <span>TOTAL:</span>
            <span>$${order.total} MXN</span>
          </div>
          <div class="escpos-payment-status">
            MÉTODO: <strong>${order.paymentMethod ? order.paymentMethod.toUpperCase() : 'TRANSFERENCIA'}</strong>
            <br>[ ESTADO: ${order.paymentStatus === 'PAID' ? 'PAGADO ✓' : 'PENDIENTE'} ]
          </div>
        </div>

        <div class="escpos-divider">--------------------------------</div>

        <div class="escpos-delivery-info">
          <div><strong>ENTREGA A DOMICILIO:</strong></div>
          <div>📍 ${order.address ? (order.address.street || 'Ubicación GPS registrada') : 'Ubicación GPS'}</div>
          <div>Int/Piso: <strong>${order.address ? (order.address.interior || 'S/N') : 'S/N'}</strong></div>
          <div>Ref: <em>${order.address ? (order.address.references || 'Sin referencia') : 'N/A'}</em></div>
        </div>

        <div class="escpos-divider">================================</div>
        <div class="escpos-footer text-center">
          <div>¡Gracias por tu preferencia!</div>
          <div>WhatsApp Oficial: +52 55 4920 1188</div>
          <div class="escpos-barcode">||| | ||||| |||| || | |||| |||</div>
          <div class="escpos-cut">[ CORTE AUTOMÁTICO ESC/POS ]</div>
        </div>
      </div>
    `;
  }

  /**
   * Genera la etiqueta adhesiva (Sticker) para empaquetado de bolsa con QR
   */
  generateBagStickerHTML(order) {
    if (!order) return '<div class="thermal-sticker">Seleccione una orden.</div>';

    const itemsSummary = (order.items || []).map(i => `${i.quantity || 1}x ${i.name}`).join(' | ');
    const criticalList = [];
    (order.items || []).forEach(i => {
      if (i.exclusions) {
        i.exclusions.forEach(e => {
          if (e.isCritical || (e.tag && (e.tag.includes('ALERGIA') || e.tag.includes('SIN')))) {
            criticalList.push(e.tag || e.label);
          }
        });
      }
    });

    const allergenWarning = criticalList.length > 0
      ? `<div class="sticker-alert-box">⚠️ ALÉRGENOS / EXCLUSIONES: ${[...new Set(criticalList)].join(', ')}</div>`
      : '';

    return `
      <div class="thermal-sticker" id="printable-bag-sticker">
        <div class="sticker-header">
          <span class="sticker-brand">🍣 SUSHI ERIZO</span>
          <span class="sticker-id">#${order.id}</span>
        </div>
        <div class="sticker-customer">
          <strong>👤 ${order.customerName}</strong>
          <span class="sticker-phone">${order.customerPhone || 'WhatsApp'}</span>
        </div>
        <div class="sticker-items">
          <strong>📦 CONTENIDO DEL PAQUETE:</strong>
          <p>${itemsSummary}</p>
        </div>
        ${allergenWarning}
        <div class="sticker-footer">
          <div class="sticker-qr">
            <svg viewBox="0 0 100 100" class="qr-svg" width="52" height="52" aria-label="QR Code">
              <rect width="100" height="100" fill="#fff" />
              <rect x="5" y="5" width="30" height="30" fill="#000" />
              <rect x="10" y="10" width="20" height="20" fill="#fff" />
              <rect x="15" y="15" width="10" height="10" fill="#000" />
              <rect x="65" y="5" width="30" height="30" fill="#000" />
              <rect x="70" y="10" width="20" height="20" fill="#fff" />
              <rect x="75" y="15" width="10" height="10" fill="#000" />
              <rect x="5" y="65" width="30" height="30" fill="#000" />
              <rect x="10" y="70" width="20" height="20" fill="#fff" />
              <rect x="15" y="75" width="10" height="10" fill="#000" />
              <rect x="40" y="15" width="10" height="10" fill="#000" />
              <rect x="45" y="35" width="15" height="15" fill="#000" />
              <rect x="65" y="45" width="20" height="10" fill="#000" />
              <rect x="40" y="65" width="15" height="20" fill="#000" />
              <rect x="65" y="70" width="20" height="20" fill="#000" />
            </svg>
          </div>
          <div class="sticker-meta">
            <div><strong>SELLO DE SEGURIDAD</strong></div>
            <div>Consumir dentro de 2 hrs</div>
            <div class="sticker-time">Hora: ${new Date(order.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
      </div>
    `;
  }
}
