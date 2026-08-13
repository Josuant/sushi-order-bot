import os
import sys
from flask import Flask, render_template_string, redirect, url_for, request, jsonify

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from store import (
    init_db, get_pending_orders, get_all_orders, update_order_status,
    get_order_by_id,
)

app = Flask(__name__)

STATUS_LABELS = {
    "pending": "Pendiente",
    "preparing": "En preparación",
    "ready": "Listo",
    "completed": "Completado",
}

DASHBOARD_TEMPLATE = """
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard Chef - EriZushi</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; }
    .header { background: #16213e; padding: 1.5rem 2rem; border-bottom: 2px solid #e94560; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 1.5rem; color: #fff; }
    .header h1 span { color: #e94560; }
    .live { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #4ecca3; }
    .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ecca3; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    .stats { display: flex; gap: 1.5rem; padding: 1rem 2rem; background: #0f3460; }
    .stat { font-size: 0.9rem; }
    .stat strong { color: #e94560; font-size: 1.2rem; }
    .main { padding: 1.5rem 2rem; }
    .empty { text-align: center; padding: 3rem; color: #888; font-size: 1.1rem; }
    table { width: 100%; border-collapse: collapse; background: #16213e; border-radius: 8px; overflow: hidden; }
    th { background: #0f3460; padding: 0.75rem 1rem; text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; color: #aaa; }
    td { padding: 0.75rem 1rem; border-top: 1px solid #1a1a2e; font-size: 0.9rem; vertical-align: top; }
    tr:hover { background: #1a1a40; }
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .badge-pending { background: #e94560; color: #fff; }
    .badge-preparing { background: #f0c27f; color: #1a1a2e; }
    .badge-ready { background: #4ecca3; color: #1a1a2e; }
    .badge-completed { background: #555; color: #ccc; }
    .items-list { font-size: 0.85rem; }
    .items-list div { margin: 2px 0; }
    .total { color: #4ecca3; font-weight: 700; }
    .btn { padding: 0.35rem 0.7rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600; margin: 2px; }
    .btn-preparing { background: #f0c27f; color: #1a1a2e; }
    .btn-ready { background: #4ecca3; color: #1a1a2e; }
    .btn-complete { background: #e94560; color: #fff; }
    .btn:hover { opacity: 0.85; }
    .history { margin-top: 2rem; }
    .history h2 { font-size: 1.2rem; margin-bottom: 1rem; color: #aaa; }
    .instructions { color: #f0c27f; font-size: 0.8rem; }
    .time { color: #888; font-size: 0.75rem; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
    .toast { position: fixed; bottom: 20px; right: 20px; background: #4ecca3; color: #1a1a2e; padding: 1rem 1.5rem; border-radius: 8px; font-weight: 700; box-shadow: 0 4px 20px rgba(0,0,0,0.4); display: none; z-index: 100; }
  </style>
</head>
<body>
  <div class="toast" id="toast">🔔 ¡Nuevo pedido!</div>
  <div class="header">
    <h1>🍣 <span>EriZushi</span> — Panel del Chef</h1>
    <div class="live"><span class="live-dot"></span> Auto-actualización activa</div>
  </div>
  <div class="stats">
    <div class="stat">Pendientes: <strong>{{ pending|length }}</strong></div>
    <div class="stat">En preparación: <strong>{{ preparing_count }}</strong></div>
    <div class="stat">Listos: <strong>{{ ready_count }}</strong></div>
    <div class="stat">Total: <strong>{{ all_orders|length }}</strong></div>
  </div>
  <div class="main">
    {% if active_orders %}
    <table>
      <thead>
        <tr>
          <th>#</th><th>Cliente</th><th>Artículos</th><th>Total</th><th>Estado</th><th>Hora</th><th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {% for order in active_orders %}
        <tr data-order-id="{{ order.id }}" data-status="{{ order.status }}">
          <td><strong>{{ order.id }}</strong></td>
          <td><strong>{{ order.customer_name }}</strong><br><span class="time">{{ order.created_at.split('T')[1][:5] }}</span></td>
          <td class="items-list">
            {% for item in order.item_list %}
            <div>• {{ item.sushi_type }} × {{ item.quantity }} — ${{ item.subtotal }}</div>
            {% endfor %}
            {% if order.instructions %}<div class="instructions">📝 {{ order.instructions }}</div>{% endif %}
          </td>
          <td class="total">${{ order.total }}</td>
          <td><span class="badge badge-{{ order.status }}">{{ status_labels.get(order.status, order.status) }}</span></td>
          <td class="time">{{ order.created_at.split('T')[1][:5] }}</td>
          <td class="actions">
            {% if order.status == 'pending' %}
            <form action="/status/{{ order.id }}/preparing" method="post"><button class="btn btn-preparing">👨‍🍳 En preparación</button></form>
            {% endif %}
            {% if order.status in ('pending', 'preparing') %}
            <form action="/status/{{ order.id }}/ready" method="post"><button class="btn btn-ready">✅ Listo</button></form>
            {% endif %}
            <form action="/status/{{ order.id }}/completed" method="post"><button class="btn btn-complete">✔ Entregado</button></form>
          </td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    {% else %}
    <div class="empty">🍣 No hay pedidos activos. ¡Esperando nuevos pedidos!</div>
    {% endif %}

    <div class="history">
      <h2>📋 Historial reciente</h2>
      {% if history_orders %}
      <table>
        <thead>
          <tr><th>#</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Hora</th></tr>
        </thead>
        <tbody>
          {% for order in history_orders %}
          <tr>
            <td>{{ order.id }}</td>
            <td>{{ order.customer_name }}</td>
            <td>${{ order.total }}</td>
            <td><span class="badge badge-{{ order.status }}">{{ status_labels.get(order.status, order.status) }}</span></td>
            <td class="time">{{ order.created_at.split('T')[1][:5] }}</td>
          </tr>
          {% endfor %}
        </tbody>
      </table>
      {% else %}
      <div class="empty">No hay historial aún.</div>
      {% endif %}
    </div>
  </div>

  <script>
    let lastPendingCount = {{ pending|length }};
    let lastOrderIds = new Set([{% for o in pending %}{{ o.id }},{% endfor %}]);

    function playSound() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } catch (e) {}
    }

    function showToast() {
      const toast = document.getElementById('toast');
      toast.style.display = 'block';
      setTimeout(() => toast.style.display = 'none', 4000);
    }

    async function refresh() {
      try {
        const resp = await fetch('/api/orders');
        const data = await resp.json();
        const pendingIds = new Set(data.pending_ids);
        const hasNew = [...pendingIds].some(id => !lastOrderIds.has(id));
        if (hasNew) {
          playSound();
          showToast();
          setTimeout(() => window.location.reload(), 1500);
        }
        lastOrderIds = pendingIds;
        lastPendingCount = data.pending_count;
      } catch (e) {}
    }

    setInterval(refresh, 8000);
  </script>
</body>
</html>
"""


@app.route("/")
def dashboard():
    init_db()
    orders = get_all_orders(limit=100)
    active = [o for o in orders if o["status"] in ("pending", "preparing", "ready")]
    history = [o for o in orders if o["status"] == "completed"]
    # Pre-procesar para evitar conflicto Jinja2 con dict.items()
    for o in active + history:
        o["item_list"] = o.get("items", [])
    preparing_count = sum(1 for o in orders if o["status"] == "preparing")
    ready_count = sum(1 for o in orders if o["status"] == "ready")
    return render_template_string(
        DASHBOARD_TEMPLATE,
        active_orders=active,
        history_orders=history[:30],
        pending=[o for o in orders if o["status"] == "pending"],
        all_orders=orders,
        preparing_count=preparing_count,
        ready_count=ready_count,
        status_labels=STATUS_LABELS,
    )


@app.route("/status/<int:order_id>/<status>", methods=["POST"])
def set_status(order_id, status):
    if status not in ("preparing", "ready", "completed"):
        return redirect(url_for("dashboard"))
    init_db()
    order = get_order_by_id(order_id)
    if order and update_order_status(order_id, status):
        # Notificar al cliente en Telegram si tiene chat_id
        customer_chat_id = order.get("customer_chat_id")
        if customer_chat_id:
            status_msgs = {
                "preparing": "👨‍🍳 Tu pedido está **en preparación**... ¡Paciencia!",
                "ready": "✅ ¡Tu pedido está **listo**! Puedes pasar a recogerlo. 🍣",
                "completed": "✔ Pedido **entregado**. ¡Buen provecho! 🍣",
            }
            try:
                import httpx
                bot_token = os.environ.get("TELEGRAM_API_TOKEN")
                if bot_token:
                    httpx.post(
                        f"https://api.telegram.org/bot{bot_token}/sendMessage",
                        json={
                            "chat_id": customer_chat_id,
                            "text": f"🎫 **Pedido #{order_id}**\n{status_msgs.get(status, '')}",
                            "parse_mode": "Markdown",
                        },
                        timeout=10,
                    )
            except Exception as e:
                print(f"Notif error: {e}")
    return redirect(url_for("dashboard"))


@app.route("/api/orders")
def api_orders():
    init_db()
    orders = get_pending_orders()
    return jsonify({
        "pending_count": len(orders),
        "pending_ids": [o["id"] for o in orders],
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)