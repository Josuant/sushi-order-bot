import os
import sys
from flask import Flask, render_template_string, redirect, url_for

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from store import init_db, get_pending_orders, get_all_orders, complete_order

app = Flask(__name__)

DASHBOARD_TEMPLATE = """
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard Chef - Sushi</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; }
    .header { background: #16213e; padding: 1.5rem 2rem; border-bottom: 2px solid #e94560; }
    .header h1 { font-size: 1.5rem; color: #fff; display: flex; align-items: center; gap: 0.5rem; }
    .header h1 span { color: #e94560; }
    .stats { display: flex; gap: 1rem; padding: 1rem 2rem; background: #0f3460; }
    .stat { font-size: 0.9rem; }
    .stat strong { color: #e94560; }
    .main { padding: 1.5rem 2rem; }
    .empty { text-align: center; padding: 3rem; color: #888; font-size: 1.1rem; }
    table { width: 100%; border-collapse: collapse; background: #16213e; border-radius: 8px; overflow: hidden; }
    th { background: #0f3460; padding: 0.75rem 1rem; text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; color: #aaa; }
    td { padding: 0.75rem 1rem; border-top: 1px solid #1a1a2e; font-size: 0.9rem; }
    tr:hover { background: #1a1a40; }
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .badge-pending { background: #e94560; color: #fff; }
    .badge-completed { background: #4ecca3; color: #1a1a2e; }
    .btn { padding: 0.4rem 0.8rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
    .btn-complete { background: #4ecca3; color: #1a1a2e; }
    .btn-complete:hover { background: #3db88b; }
    .btn-edit { background: #e94560; color: #fff; }
    .btn-edit:hover { background: #d63851; }
    .history { margin-top: 2rem; }
    .history h2 { font-size: 1.2rem; margin-bottom: 1rem; color: #aaa; }
    .ingredients { color: #4ecca3; font-size: 0.8rem; }
    .instructions { color: #f0c27f; font-size: 0.8rem; }
    .time { color: #888; font-size: 0.75rem; }
    .actions { display: flex; gap: 0.5rem; }
    form { display: inline; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🍣 <span>EriZushi</span> — Panel del Chef</h1>
  </div>
  <div class="stats">
    <div class="stat">Pedidos pendientes: <strong>{{ pending|length }}</strong></div>
    <div class="stat">Total: <strong>{{ all_orders|length }}</strong></div>
  </div>
  <div class="main">
    {% if pending %}
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Cliente</th>
          <th>Tipo</th>
          <th>Extras</th>
          <th>Cant.</th>
          <th>Instrucciones</th>
          <th>Hora</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {% for order in pending %}
        <tr>
          <td>{{ order.id }}</td>
          <td><strong>{{ order.customer_name }}</strong></td>
          <td>{{ order.sushi_type }}</td>
          <td class="ingredients">{{ order.ingredients or '-' }}</td>
          <td>{{ order.quantity }}</td>
          <td class="instructions">{{ order.instructions or '-' }}</td>
          <td class="time">{{ order.created_at.split('T')[1][:5] }}</td>
          <td class="actions">
            <form action="/complete/{{ order.id }}" method="post">
              <button class="btn btn-complete" type="submit">✅ Completar</button>
            </form>
          </td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    {% else %}
    <div class="empty">🍣 No hay pedidos pendientes. ¡Esperando nuevos pedidos!</div>
    {% endif %}

    <div class="history">
      <h2>📋 Historial de pedidos</h2>
      {% if all_orders %}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Hora</th>
          </tr>
        </thead>
        <tbody>
          {% for order in all_orders %}
          <tr>
            <td>{{ order.id }}</td>
            <td>{{ order.customer_name }}</td>
            <td>{{ order.sushi_type }}</td>
            <td><span class="badge badge-{{ order.status }}">{{ order.status }}</span></td>
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
</body>
</html>
"""


@app.route("/")
def dashboard():
    init_db()
    pending = get_pending_orders()
    all_orders = get_all_orders(limit=100)
    return render_template_string(DASHBOARD_TEMPLATE, pending=pending, all_orders=all_orders)


@app.route("/complete/<int:order_id>", methods=["POST"])
def complete(order_id):
    init_db()
    complete_order(order_id)
    return redirect(url_for("dashboard"))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)