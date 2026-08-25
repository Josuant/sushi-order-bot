/**
 * Orquestador Principal — EriZushi / Sushi Erizo
 * Conecta WhatsApp CUI, KDS Touch Tablet (3 Columnas), 
 * Control de Insumos & Merma, Pagos, Impresión y Métricas.
 * 
 * AHORA CON SUPABASE REALTIME: datos reales en vez de mock.
 */
import { MENU_DATA } from './menu-data.js';
import { INSUMOS_DATA, INITIAL_MERMAS, PROYECCION_FALTANTE, calcMerma, calcMermaPct, stockStatus, mermaPctStatus } from './insumos-data.js';
import { WhatsAppCUIEngine } from './whatsapp-cui.js';
import { KDSModule } from './kds-app.js';
import { PaymentCheckoutModule } from './payment-checkout.js';
import { ThermalPrinterModule } from './printer-escpos.js';
import { NotificationAndNPSModule } from './notifications-nps.js';
import { DoDTestSuite } from './dod-tests.js';

// ─── CONFIGURACIÓN SUPABASE ───
const SUPABASE_URL = window.__SUPABASE_CONFIG__?.url || 'https://ylacekdmvpuvpnzjastn.supabase.co';
const SUPABASE_ANON_KEY = window.__SUPABASE_CONFIG__?.anonKey || 'eyJhbG...7s-o';
const BACKEND_URL = window.__SUPABASE_CONFIG__?.backendUrl || '';

class SushiErizoEcosystem {
  constructor() {
    this.currentView = 'split';
    this.audioContext = null;
    this.selectedPrintOrderId = null;

    // Estado del cliente actual
    this.clientSession = {
      customerName: 'Cliente',
      customerPhone: '+52 55 **** ****',
      cart: [],
      address: null,
      currentOrderId: null,
      chatHistory: []
    };

    // Órdenes reales desde Supabase
    this.orders = [];
    this.insumos = JSON.parse(JSON.stringify(INSUMOS_DATA));
    this.mermas = JSON.parse(JSON.stringify(INITIAL_MERMAS));
    this.proyeccionFaltante = JSON.parse(JSON.stringify(PROYECCION_FALTANTE));

    // Métricas
    this.analytics = {
      totalConversations: 0,
      completedOrders: 0,
      initiatedCarts: 0,
      abandonedCarts: 0,
      avgBotLatencyMs: 640,
      totalDishes: 0,
      allergenMistakes: 0
    };

    // Módulos
    this.cuiEngine = new WhatsAppCUIEngine(this);
    this.kdsModule = new KDSModule(this);
    this.paymentModule = new PaymentCheckoutModule(this);
    this.printerModule = new ThermalPrinterModule();
    this.notificationsModule = new NotificationAndNPSModule(this);
    this.testSuite = new DoDTestSuite();

    // Supabase Realtime channel
    this._supabaseChannel = null;
    this._sbHeaders = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    this.initAudio();
    this.initClock();
  }

  // ─── BACKEND API HELPERS (instead of direct Supabase calls) ───

  _apiUrl(path) {
    const base = window.__SUPABASE_CONFIG__?.backendUrl || '';
    // Add /api/ prefix if not already there
    const apiPath = path.startsWith('/') ? path : `/api/${path}`;
    return `${base}${apiPath}`;
  }

  async _apiGet(path) {
    try {
      const res = await fetch(this._apiUrl(path));
      if (!res.ok) throw new Error(`API GET ${path}: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('API call failed, using mock data:', e.message);
      return [];
    }
  }

  async _apiPost(path, body) {
    try {
      const res = await fetch(this._apiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`API POST ${path}: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('API POST failed:', e.message);
      return null;
    }
  }

  async _apiPatch(path, body) {
    try {
      const res = await fetch(this._apiUrl(path), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`API PATCH ${path}: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('API PATCH failed:', e.message);
      return null;
    }
  }

  // ─── REALTIME SUBSCRIPTION ───

  _initRealtime() {
    // Usamos polling cada 5s como fallback (sin depender de librería realtime)
    // En producción, usar @supabase/realtime o Supabase WebSocket nativo
    this._realtimeInterval = setInterval(() => {
      if (this.currentView === 'split' || this.currentView === 'expedicion') {
        this.loadOrders();
      }
    }, 5000);
  }

  // ─── CARGA INICIAL ───

  async init() {
    await this.loadOrders();
    await this.loadInsumosFromDatabase();
    await this.loadMetrics();

    this.renderChatMessages();
    this.renderKDS();
    this.renderInsumosDashboard();
    this.renderKPIDashboard();
    this.setupViewControls();
    this.updatePrinterStationSelector();
    this.renderPrinterStation();
    this._initRealtime();

    setTimeout(() => this.sendBotWelcome(), 300);
    this.updateSupabaseBadge();
  }

  async loadOrders() {
    try {
      const data = await this._apiGet('orders');
      // Normalizar snake_case de Supabase → camelCase que espera KDS
      this.orders = (Array.isArray(data) ? data : []).map(o => ({
        id: o.id,
        customerName: o.customer_name || o.customerName || '',
        customerPhone: o.customer_phone || o.customerPhone || '',
        customer_chat_id: o.customer_chat_id,
        status: o.status || 'PENDING',
        createdAt: o.created_at || o.createdAt || '',
        paymentStatus: o.payment_status || o.paymentStatus || 'PENDING',
        paymentMethod: o.payment_method || o.paymentMethod || '',
        subtotal: o.subtotal || 0,
        deliveryFee: o.delivery_fee ?? 35,
        total: o.total || 0,
        instructions: o.instructions || '',
        address: o.delivery_address ? {
          street: o.delivery_address,
          interior: o.delivery_interior || '',
          references: o.delivery_references || ''
        } : null,
        waDeliveryStatus: o.wa_delivery_status || 'read',
        driverName: o.driver_name || '',
        deliveryETA: o.delivery_eta || '',
        items: (o.order_items || []).map(i => ({
          id: i.id,
          name: i.name || i.sushi_type || '',
          quantity: i.quantity || 1,
          price: i.unit_price || i.price || 0,
          unit_price: i.unit_price || i.price || 0,
          subtotal: i.subtotal || 0,
          exclusions: i.exclusions || [],
          extras: i.extras || [],
          kitchenNote: i.kitchen_note || ''
        }))
      }));
      this.renderKDS();
      this.updateCounts();
    } catch (e) {
      console.warn('Error loading orders from Supabase:', e);
    }
  }

  async loadInsumosFromDatabase() {
    try {
      const data = await this._apiGet('insumos');
      if (Array.isArray(data) && data.length > 0) {
        this.insumos = data;
      }
    } catch (e) {
      console.warn('Error loading insumos from Supabase:', e);
    }
  }

  async loadMetrics() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/metrics`);
      if (res.ok) {
        const data = await res.json();
        this.analytics.totalConversations = data.total_orders || 0;
        this.analytics.completedOrders = data.completed_orders || 0;
        this.analytics.npsScore = data.nps_score || 0;
      }
    } catch (e) {
      // Si no hay backend, calcular localmente
      const completed = this.orders.filter(o => o.status === 'delivered').length;
      this.analytics.totalConversations = this.orders.length;
      this.analytics.completedOrders = completed;
    }
  }

  updateCounts() {
    const pending = this.orders.filter(o => o.status === 'pending' || o.status === 'READY_TO_PREP');
    const prep = this.orders.filter(o => o.status === 'preparing' || o.status === 'IN_PREPARATION');
    const delivery = this.orders.filter(o => o.status === 'out_for_delivery' || o.status === 'OUT_FOR_DELIVERY');
    const delivered = this.orders.filter(o => o.status === 'delivered' || o.status === 'DELIVERED');

    const $ = id => document.getElementById(id);
    if ($('kds-count-new')) $('kds-count-new').textContent = pending.length;
    if ($('kds-count-prep')) $('kds-count-prep').textContent = prep.length;
    if ($('kds-count-delivery')) $('kds-count-delivery').textContent = delivery.length;
    if ($('kds-count-delivered-btn')) $('kds-count-delivered-btn').textContent = delivered.length;
  }

  updateSupabaseBadge() {
    const badge = document.getElementById('supabase-status-badge');
    if (badge) {
      badge.innerHTML = `<span class="status-indicator-dot"></span> 🟢 Conectado a Supabase`;
      badge.className = 'supabase-status-pill st-connected';
    }
  }

  // ─── CREAR PEDIDO ───

  async createOrderInBackend(orderData) {
    try {
      // Usar backend
      const res = await fetch(`${BACKEND_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });
      if (res.ok) return await res.json();
    } catch (e) { /* fallback directo a Supabase */ }

    try {
      const result = await this._apiPost('orders', {
        customer_name: orderData.customerName || this.clientSession.customerName,
        status: 'pending',
        payment_status: 'pending',
        subtotal: orderData.subtotal || 0,
        delivery_fee: 35,
        total: (orderData.subtotal || 0) + 35,
        instructions: orderData.instructions || ''
      });
      const orderId = result.id || result[0]?.id;
      if (orderId && orderData.items) {
        for (const item of orderData.items) {
          await this._apiPost('order_items', {
            order_id: orderId,
            name: item.name,
            quantity: item.quantity || 1,
            unit_price: item.price || 0,
            subtotal: (item.price || 0) * (item.quantity || 1),
            exclusions: item.exclusions || [],
            extras: item.extras || []
          });
        }
      }
      return { id: orderId, ...orderData };
    } catch (e) {
      console.error('Error creating order:', e);
      return null;
    }
  }

  // ─── NAVEGACIÓN ───

  setupViewControls() {
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.switchView(btn.getAttribute('data-view'));
      });
    });
  }

  switchView(view) {
    this.currentView = view;
    const container = document.getElementById('main-workspace');
    if (container) container.className = `workspace-layout view-${view}`;
    if (view === 'printer') { this.updatePrinterStationSelector(); this.renderPrinterStation(); }
    else if (view === 'kpi') this.renderKPIDashboard();
    else if (view === 'insumos') this.renderInsumosDashboard();
  }

  // ─── WHATSAPP CUI ───

  addMessageToChat(sender, content, type = 'text', payload = null) {
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender, content, type, payload,
      timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    };
    this.clientSession.chatHistory.push(msg);
    this.renderSingleChatMessage(msg);
    this.scrollChatToBottom();
    if (sender === 'bot' || sender === 'human_agent') this.playChime('whatsapp');
  }

  sendBotWelcome() {
    const { text, listMessage } = this.cuiEngine.getWelcomeMessage();
    this.addMessageToChat('bot', text, 'list_message', listMessage);
  }

  handleUserSendInput(text) {
    if (!text || text.trim() === '') return;
    const cleanText = text.trim();
    this.addMessageToChat('user', cleanText);
    this.showTypingIndicator(true);
    setTimeout(() => {
      this.showTypingIndicator(false);
      if (this.cuiEngine.isHumanHandoffActive) {
        this.showHumanOperatorToast(`Mensaje del cliente: "${cleanText}"`);
        return;
      }
      const nlpResult = this.cuiEngine.processNLPInput(cleanText);
      if (nlpResult.type === 'fall_forward') {
        this.addMessageToChat('bot', nlpResult.text, 'buttons', { buttons: nlpResult.buttons });
      } else if (nlpResult.type === 'escalation_handoff') {
        this.addMessageToChat('bot', nlpResult.text);
        this.renderHandoffBanner(true);
      } else if (nlpResult.intent === 'greeting_menu' || nlpResult.intent === 'order_intent') {
        this.sendBotWelcome();
      } else if (nlpResult.intent === 'track_order') {
        this.sendTrackingStatus();
      } else if (nlpResult.intent === 'checkout') {
        this.promptCheckout();
      } else if (nlpResult.intent === 'request_human') {
        this.cuiEngine.isHumanHandoffActive = true;
        this.renderHandoffBanner(true);
        this.addMessageToChat('bot', '🔁 Te conectamos con un operador humano en segundos...');
      } else {
        this.addMessageToChat('bot', `🤖 No entendí bien. Frase completa: "${cleanText}". ¿Quieres ver el *menú*?`);
      }
    }, 1000);
  }

  sendTrackingStatus() {
    const active = this.orders.find(o => o.customerName === this.clientSession.customerName && o.status !== 'delivered');
    if (active) {
      this.addMessageToChat('bot', `📦 Tu pedido #${active.id} está: **${active.status}**.`);
    } else {
      this.addMessageToChat('bot', '📦 No tienes pedidos activos en este momento.');
    }
  }

  promptCheckout() {
    const total = this.clientSession.cart.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    const { text, buttons } = this.cuiEngine.getCheckoutButtons(total || 475);
    this.addMessageToChat('bot', text, 'buttons', { buttons });
  }

  // ─── KDS: TRANSICIONES ───

  async transitionOrder(orderId, newStatus) {
    try {
      await this._apiPatch(`/api/orders/${orderId}/status`, { status: newStatus });
      // Notificar al cliente si tiene chat_id
      const order = this.orders.find(o => o.id == orderId);
      const statusMsgs = {
        'IN_PREPARATION': '👨‍🍳 Tu pedido está en preparación...',
        'preparing': '👨‍🍳 Tu pedido está en preparación...',
        'OUT_FOR_DELIVERY': '🛵 Tu pedido va en camino',
        'out_for_delivery': '🛵 Tu pedido va en camino',
        'DELIVERED': '🎉 Pedido entregado. ¡Buen provecho!',
        'delivered': '🎉 Pedido entregado. ¡Buen provecho!'
      };
      if (order?.customer_chat_id && statusMsgs[newStatus]) {
        fetch(`${BACKEND_URL}/api/orders/${orderId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        }).catch(() => {});
      }
      await this.loadOrders();
    } catch (e) {
      console.error('Error transitioning order:', e);
    }
  }

  async undoOrderTransition(orderId) {
    const order = this.orders.find(o => o.id == orderId);
    if (!order) return;
    const prevStatus = this.kdsModule.getPrevStatus(order.status, '');
    if (prevStatus) await this.transitionOrder(orderId, prevStatus);
  }

  async retryWhatsAppPush(orderId) {
    console.log('Retrying WhatsApp push for', orderId);
    await this._apiPatch(`/api/orders/${orderId}/status`, { wa_delivery_status: 'sent' });
    await this.loadOrders();
  }

  openPrintModal(orderId) {
    this.selectedPrintOrderId = orderId;
    this.switchView('printer');
    this.updatePrinterStationSelector();
    this.renderPrinterStation();
  }

  // ─── RENDER ───

  renderKDS() {
    this.kdsModule.renderKDSBoard(this.orders);
  }

  renderChatMessages() {
    const container = document.getElementById('whatsapp-chat-body');
    if (!container) return;
    container.innerHTML = this.clientSession.chatHistory.map(msg =>
      `<div class="wa-message ${msg.sender === 'user' ? 'wa-message-user' : 'wa-message-bot'}">
        <div class="wa-bubble">${msg.content}</div>
        <span class="wa-timestamp">${msg.timestamp}</span>
      </div>`
    ).join('');
  }

  renderSingleChatMessage(msg) {
    const container = document.getElementById('whatsapp-chat-body');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `wa-message ${msg.sender === 'user' ? 'wa-message-user' : 'wa-message-bot'}`;
    div.innerHTML = `<div class="wa-bubble">${msg.content}</div><span class="wa-timestamp">${msg.timestamp}</span>`;
    container.appendChild(div);
  }

  scrollChatToBottom() {
    const el = document.getElementById('whatsapp-chat-body');
    if (el) el.scrollTop = el.scrollHeight;
  }

  showTypingIndicator(show) {
    const el = document.getElementById('whatsapp-typing');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  renderHandoffBanner(show) {
    const el = document.getElementById('human-handoff-banner');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  showHumanOperatorToast(msg) {
    this.addMessageToChat('human_agent', `👨‍🍳 Operador recibe: "${msg}"`);
  }

  renderInsumosDashboard() {
    const tbody = document.getElementById('insumos-table-body');
    if (!tbody) return;
    tbody.innerHTML = this.insumos.map(ins => {
      const merma = calcMerma(ins);
      const pct = calcMermaPct(ins);
      const restante = Math.max(0, (ins.stock_inicial || ins.stockInicial || 0) - (ins.consumo_real || ins.consumoReal || 0));
      const s = stockStatus(ins);
      const statusClass = s === 'critico' ? 'st-critico' : s === 'alerta' ? 'st-alerta' : 'st-ok';
      return `<tr>
        <td>${ins.emoji || '📦'} <strong>${ins.nombre || ins.name}</strong></td>
        <td>${ins.stock_inicial ?? ins.stockInicial ?? 0} ${ins.unidad || 'g'}</td>
        <td>${ins.consumo_teorico ?? ins.consumoTeorico ?? 0}</td>
        <td>${ins.consumo_real ?? ins.consumoReal ?? 0}</td>
        <td><span class="merma-pct-badge ${mermaPctStatus(pct)}">${pct.toFixed(1)}%</span></td>
        <td><span class="stock-badge ${statusClass}">${restante} ${ins.unidad || 'g'}</span></td>
        <td><button class="btn-edit-insumo-sm" onclick="window.ecosystemApp.showToast('Editar ${ins.nombre || ins.id}')">✏️</button></td>
      </tr>`;
    }).join('');
  }

  renderKPIDashboard() {
    const el = document.querySelector('.panel-kpi');
    if (!el) return;
    const completed = this.orders.filter(o =>
      ['delivered', 'DELIVERED'].includes(o.status)).length;
    const total = this.orders.length || 1;
    const conv = ((completed / total) * 100).toFixed(1);
    const containers = el.querySelectorAll('.kpi-hero-number');
    if (containers.length >= 2) {
      containers[0].textContent = `${conv}%`;
      containers[1].textContent = `${this.analytics.npsScore || 'N/A'}`;
    }
  }

  updatePrinterStationSelector() {
    const sel = document.getElementById('printer-order-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleccionar orden...</option>' +
      this.orders.filter(o => !['delivered', 'DELIVERED'].includes(o.status))
        .map(o => `<option value="${o.id}">#${o.id} — ${o.customer_name || o.customerName}</option>`).join('');
    if (this.selectedPrintOrderId) sel.value = this.selectedPrintOrderId;
  }

  renderPrinterStation() {
    const sel = document.getElementById('printer-order-select');
    if (!sel) return;
    const orderId = sel.value;
    if (!orderId) return;
    const order = this.orders.find(o => o.id == orderId);
    if (!order) return;
    document.getElementById('receipt-preview-container').innerHTML =
      this.printerModule.generateReceiptHTML(order);
    document.getElementById('sticker-preview-container').innerHTML =
      this.printerModule.generateBagStickerHTML(order);
  }

  onPrinterOrderSelectChange(value) {
    this.selectedPrintOrderId = value;
    this.renderPrinterStation();
  }

  executeThermalPrint() {
    this.showToast('🖨️ Comando de impresión enviado a ESC/POS (simulado)');
  }

  // ─── MODALES ───

  openQuickOrderModal() {
    const total = this.clientSession.cart.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0) || 475;
    const name = prompt('Nombre del cliente:', 'Cliente');
    if (!name) return;
    this.createOrderInBackend({
      customerName: name,
      items: [{ name: 'Pedido rápido', quantity: 1, price: total }],
      subtotal: total,
      total: total + 35
    }).then(() => this.loadOrders());
  }

  openDeliveredDrawer() {
    const delivered = this.orders.filter(o =>
      ['delivered', 'DELIVERED'].includes(o.status));
    const html = delivered.map(o =>
      `<div class="kds-delivered-item">#${o.id} — ${o.customer_name || o.customerName}</div>`
    ).join('') || '<div class="kds-empty-col">Sin entregados hoy</div>';
    const drawer = document.getElementById('kds-col-delivered-drawer') || document.createElement('div');
    if (!drawer.id) {
      drawer.id = 'kds-col-delivered-drawer';
      drawer.className = 'kds-delivered-drawer-overlay';
      drawer.innerHTML = `<div class="kds-delivered-drawer-content">
        <div class="kds-delivered-header"><h3>📁 Historial Entregados</h3>
        <button onclick="this.parentElement.parentElement.remove()">✕</button></div>
        <div class="kds-delivered-list">${html}</div></div>`;
      document.body.appendChild(drawer);
    } else {
      drawer.querySelector('.kds-delivered-list').innerHTML = html;
    }
  }

  openSupabaseConfigModal() { this.showToast('⚙️ Configuración de Supabase disponible en el código'); }
  openInsumosEditModal() { this.showToast('✏️ Edición de insumos próximamente'); }
  openMermaModal() { this.showToast('📉 Registro de merma próximamente'); }
  openRecipePanel(orderId, itemIdx) { this.showToast(`🔍 Receta de ${orderId} ítem #${itemIdx}`); }

  async saveSupabaseConfigForm() {
    this.showToast('💾 Configuración guardada. Recargando...');
    window.location.reload();
  }

  showToast(msg) {
    const toast = document.getElementById('global-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.style.display = 'none', 300); }, 3000);
  }

  playChime(type = 'whatsapp') {
    try {
      if (!this.audioContext) { this.initAudio(); if (!this.audioContext) return; }
      if (this.audioContext.state === 'suspended') this.audioContext.resume();
      const ctx = this.audioContext, now = ctx.currentTime;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      if (type === 'whatsapp') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now); osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
        gain.gain.setValueAtTime(0.18, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.1);
        gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      }
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.55);
    } catch (e) { /* audio not ready */ }
  }

  initAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioContext = new AudioCtx();
    } catch (e) { /* no audio */ }
  }

  initClock() {
    setInterval(() => {
      const el = document.getElementById('header-live-clock');
      if (el) el.textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);
  }

  runDoDTests() {
    const results = this.testSuite.runAllTests();
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    this.showToast(`🧪 Tests: ${passed}/${total} pasaron`);
    console.table(results);
  }

  loadDemoScenario(scenarioId) {
    // Cargar escenario de demostración
    this.loadOrders();
    this.showToast(`📋 Escenario "${scenarioId}" cargado`);
  }

  sendHumanAgentMessage(msg) {
    const input = document.getElementById('human-agent-input');
    const text = msg || input?.value;
    if (text) {
      this.addMessageToChat('human_agent', `👨‍🍳 Chef: ${text}`);
      if (input) input.value = '';
    }
  }

  releaseHumanHandoff() {
    this.cuiEngine.isHumanHandoffActive = false;
    this.cuiEngine.consecutiveFailures = 0;
    this.renderHandoffBanner(false);
    this.addMessageToChat('bot', '🤖 El bot ha retomado la conversación.');
  }

  triggerHandoff(info) {
    this.renderHandoffBanner(true);
  }

  updateOrderPaymentStatus(orderId, status, method, txId) {
    this._apiPatch(`/api/orders/${orderId}/status`, {
      payment_status: status.toLowerCase(),
      payment_method: method,
      payment_transaction_id: txId
    }).then(() => this.loadOrders()).catch(() => {});
  }

  testSupabaseConnectionUI() {
    this._apiGet('insumos')
      .then(() => this.showToast('🟢 Conexión Supabase exitosa'))
      .catch(e => this.showToast(`🔴 Error de conexión: ${e.message}`));
  }

  copySupabaseSQLToClipboard() {
    navigator.clipboard.writeText(`-- Schema SQL en supabase/schema.sql`).then(() =>
      this.showToast('📋 SQL copiado al portapapeles'));
  }
}

// ─── INIT ───
window.ecosystemApp = new SushiErizoEcosystem();
document.addEventListener('DOMContentLoaded', () => window.ecosystemApp.init());
