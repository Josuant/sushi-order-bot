import os
from flask import Flask, render_template_string, request, redirect, url_for

app = Flask(__name__)

pending_orders = [
    {"id": 1, "customer_name": "Alice", "sushi_type": "Maki", "quantity": "2", "status": "Pending", "instructions": ""},
    {"id": 2, "customer_name": "Bob", "sushi_type": "Nigiri", "quantity": "1", "status": "Pending", "instructions": ""},
]

DASHBOARD_TEMPLATE = """
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard Chef - Sushi</title>
  <style>
    body { font-family: sans-serif; margin: 20px; background: #f4f4f4; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #fff; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #f2f2f2; }
    .status-pending { color: orange; font-weight: bold; }
    .status-completed { color: green; font-weight: bold; }
    .btn { padding: 5px 10px; cursor: pointer; border: 1px solid #ccc; border-radius: 3px; }
    .btn.complete { background: #e0ffe0; border-color: #a0d0a0; color: green; }
  </style>
</head>
<body>
  <h1>🍣 Pedidos Pendientes</h1>
  <table>
    <thead>
      <tr><th>ID</th><th>Cliente</th><th>Tipo</th><th>Cantidad</th><th>Instrucciones</th><th>Estado</th><th>Acciones</th></tr>
    </thead>
    <tbody>
      {% for order in orders %}
      <tr>
        <td>{{ order.id }}</td>
        <td>{{ order.customer_name }}</td>
        <td>{{ order.sushi_type }}</td>
        <td>{{ order.quantity }}</td>
        <td>{{ order.instructions or '-' }}</td>
        <td class="status-{{ order.status.lower() }}">{{ order.status }}</td>
        <td>
          <form action="/complete/{{ order.id }}" method="post" style="display:inline;">
            <button class="btn complete" type="submit">Completar</button>
          </form>
        </td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
</body>
</html>
"""


@app.route("/")
def dashboard():
    return render_template_string(DASHBOARD_TEMPLATE, orders=pending_orders)


@app.route("/complete/<int:order_id>", methods=["POST"])
def complete_order(order_id):
    for order in pending_orders:
        if order["id"] == order_id:
            order["status"] = "Completed"
            break
    return redirect(url_for("dashboard"))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
