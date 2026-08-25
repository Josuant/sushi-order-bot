"""
Backend mínimo — EriZushi / Sushi Erizo
FastAPI server que:
  1. Sirve el frontend KDS (estáticos)
  2. Webhook de Telegram (recibe updates, escribe en Supabase)
  3. Webhook de pagos (Mercado Pago / Stripe / SPEI)
  4. Endpoints de impresión ESC/POS
  5. Endpoints auxiliares para el bot (consultas Supabase)
"""
import os, json, hmac, hashlib
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import httpx
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="EriZushi Backend")

# ──────── CONFIG ────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", SUPABASE_ANON_KEY)
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_API_TOKEN", "")
NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
NOTION_DB_ID = os.environ.get("NOTION_DB_ID", "c5662e5e-6b07-4e48-a3ca-c1cd1c317667")
CHEF_USERNAME = os.environ.get("CHEF_USERNAME", "Zeralve")
PAYMENT_WEBHOOK_SECRET = os.environ.get("PAYMENT_WEBHOOK_SECRET", "")

SB_HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


# ──────── HELPERS ────────

async def sb_get(path: str, params: dict = None) -> list | dict:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB_HEADERS, params=params, timeout=15)
        r.raise_for_status()
        return r.json()

async def sb_post(path: str, data: dict) -> dict:
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB_HEADERS, json=data, timeout=15)
        r.raise_for_status()
        return r.json()

async def sb_patch(path: str, data: dict) -> None:
    async with httpx.AsyncClient() as c:
        r = await c.patch(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB_HEADERS, json=data, timeout=15)
        r.raise_for_status()


async def notify_chefs(order_data: dict):
    """Envía notificación del nuevo pedido a todos los chefs por Telegram."""
    if not TELEGRAM_TOKEN:
        return
    # Obtener chefs de Supabase
    chefs = await sb_get("users", params={"roles": "like.*chef*", "select": "chat_id,username"})
    lines = [f"• {i['name']} x{i['quantity']} — ${i['subtotal']}" for i in order_data.get("items", [])]
    msg = (
        f"🍣 **Nuevo Pedido** 🍣\n\n"
        f"**Cliente:** {order_data.get('customer_name', '')}\n"
        + "\n".join(lines) +
        f"\n\n💰 **TOTAL: ${order_data.get('total', 0)}**\n"
        f"🎫 **ID: #{order_data.get('id', '?')}**\n"
        f"¡A preparar! 👨‍🍳"
    )
    async with httpx.AsyncClient() as c:
        for chef in (chefs if isinstance(chefs, list) else []):
            chat_id = chef.get("chat_id")
            if chat_id:
                try:
                    await c.post(
                        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                        json={"chat_id": chat_id, "text": msg, "parse_mode": "Markdown"},
                        timeout=8,
                    )
                except Exception:
                    pass
        # Fallback: mencionar al chef principal
        try:
            await c.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                json={"chat_id": f"@{CHEF_USERNAME}", "text": msg, "parse_mode": "Markdown"},
                timeout=8,
            )
        except Exception:
            pass


# ──────── RUTAS ────────

@app.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


# ─── WEBHOOK TELEGRAM ───
@app.post("/webhook/telegram")
async def telegram_webhook(request: Request):
    """Recibe updates de Telegram Bot API y escribe en Supabase."""
    body = await request.json()
    message = body.get("message", {})
    chat_id = message.get("from", {}).get("id")
    text = (message.get("text") or "").strip()
    username = message.get("from", {}).get("username") or message.get("from", {}).get("first_name", "?")

    if not chat_id or not text:
        return {"ok": True}

    # Registrar/actualizar usuario
    await sb_post("users", {
        "chat_id": chat_id,
        "username": username,
        "roles": "cliente",
        "registered_at": datetime.now(timezone.utc).isoformat(),
    })

    # Procesar comandos básicos (el bot principal sigue usando python-telegram-bot)
    # Este webhook es para operaciones simples desde el backend
    return {"ok": True}


# ─── WEBHOOK DE PAGOS ───
@app.post("/webhook/payment")
async def payment_webhook(request: Request):
    """Webhook de Mercado Pago / Stripe / SPEI STP."""
    payload = await request.json()
    event = payload.get("event") or payload.get("type", "")
    order_id = None

    # Extraer order_id según proveedor
    if "order_id" in payload:
        order_id = payload["order_id"]
    elif "external_reference" in payload:
        order_id = payload["external_reference"]
    elif "reference" in payload:
        order_id = payload["reference"]

    if not order_id or event != "payment.succeeded":
        return JSONResponse({"ok": True, "ignored": True})

    provider = payload.get("provider", "MERCADO_PAGO_STRIPE")
    tx_id = payload.get("transaction_id", f"TX-{os.urandom(4).hex().upper()}")

    # Actualizar estado del pedido en Supabase
    await sb_patch(f"orders?id=eq.{order_id}", {
        "payment_status": "paid",
        "payment_method": provider,
        "payment_transaction_id": tx_id,
        "status": "pending",
    })

    return {"ok": True, "order_id": order_id, "status": "paid"}


# ─── ENDPOINTS AUX PARA EL BOT ───
@app.get("/api/users/{chat_id}")
async def get_user(chat_id: int):
    try:
        data = await sb_get(f"users?chat_id=eq.{chat_id}")
        return data[0] if data else {"chat_id": chat_id, "roles": "cliente"}
    except Exception as e:
        return {"chat_id": chat_id, "roles": "cliente", "error": str(e)}

@app.post("/api/users")
async def create_user(data: dict):
    result = await sb_post("users", data)
    return result

@app.patch("/api/users/{chat_id}")
async def update_user(chat_id: int, data: dict):
    await sb_patch(f"users?chat_id=eq.{chat_id}", data)
    return {"ok": True}

@app.post("/api/orders")
async def create_order(data: dict):
    """Crea un pedido en Supabase y notifica a chefs."""
    # Extraer items y calcular total
    items = data.pop("items", [])
    subtotal = sum(i.get("unit_price", 0) * i.get("quantity", 1) for i in items)
    delivery_fee = data.get("delivery_fee", 35)
    data["subtotal"] = subtotal
    data["total"] = subtotal + delivery_fee
    data["status"] = "pending"
    data["payment_status"] = "pending"

    # Crear pedido
    order = await sb_post("orders", data)
    order_id = order.get("id") or order[0].get("id")

    # Crear items
    for item in items:
        item["order_id"] = order_id
        item["subtotal"] = item.get("unit_price", 0) * item.get("quantity", 1)
        await sb_post("order_items", item)

    # Notificar chefs
    order_data = {**data, "id": order_id, "items": items, "total": subtotal + delivery_fee}
    await notify_chefs(order_data)

    return order_data

@app.get("/api/orders")
async def list_orders(status: Optional[str] = None, limit: int = 100):
    params = {"select": "*,order_items(*)", "order": "created_at.desc", "limit": limit}
    if status:
        params["status"] = f"eq.{status}"
    data = await sb_get("orders", params)
    return data

@app.get("/api/orders/{order_id}")
async def get_order(order_id: int):
    data = await sb_get(f"orders?id=eq.{order_id}", {"select": "*,order_items(*)"})
    return data[0] if data else {"error": "not_found"}

@app.patch("/api/orders/{order_id}/status")
async def update_order_status(order_id: int, data: dict):
    """Actualiza estado de un pedido: {status, payment_status, ...}"""
    allowed = {"status", "payment_status", "payment_method", "driver_name", "delivery_eta", "wa_delivery_status"}
    update = {k: v for k, v in data.items() if k in allowed}
    if not update:
        raise HTTPException(400, "No valid fields")
    await sb_patch(f"orders?id=eq.{order_id}", update)
    # Obtener pedido para notificar al cliente
    order = await sb_get(f"orders?id=eq.{order_id}", {"select": "*,order_items(*)"})
    order = order[0] if isinstance(order, list) and order else {}
    customer_chat_id = order.get("customer_chat_id")
    status = update.get("status", "")
    status_msgs = {
        "preparing": "👨‍🍳 Tu pedido **está en preparación**... 🍣",
        "ready": "✅ ¡Tu pedido **está listo**! Puedes pasar a recogerlo. 🍣",
        "out_for_delivery": "🛵 ¡Tu pedido **va en camino**! 🍣",
        "delivered": "🎉 **Pedido entregado**. ¡Buen provecho! 🍣",
        "cancelled": "❌ Tu pedido ha sido **cancelado**.",
    }
    if customer_chat_id and status in status_msgs and TELEGRAM_TOKEN:
        async with httpx.AsyncClient() as c:
            try:
                await c.post(
                    f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                    json={
                        "chat_id": customer_chat_id,
                        "text": f"🎫 **Pedido #{order_id}**\n{status_msgs[status]}",
                        "parse_mode": "Markdown",
                    },
                    timeout=8,
                )
            except Exception:
                pass
    return {"ok": True, "order_id": order_id, **update}

@app.get("/api/insumos")
async def list_insumos():
    data = await sb_get("insumos", {"select": "*", "order": "nombre.asc"})
    return data

@app.post("/api/insumos")
async def upsert_insumo(data: dict):
    result = await sb_post("insumos", data)
    return result

@app.get("/api/drivers")
async def list_drivers():
    data = await sb_get("drivers", {"select": "*"})
    return data

@app.get("/api/metrics")
async def get_metrics():
    """KPIs: conversión, abandono, NPS, errores cocina."""
    orders = await sb_get("orders", {"select": "status,payment_status", "limit": 1000})
    nps = await sb_get("nps_surveys", {"select": "score", "limit": 1000})
    if not isinstance(orders, list):
        orders = []
    if not isinstance(nps, list):
        nps = []
    total = len(orders)
    completed = sum(1 for o in orders if o.get("status") == "delivered")
    paid = sum(1 for o in orders if o.get("payment_status") == "paid")
    conversion = round((completed / total * 100), 1) if total else 0
    promoters = sum(1 for n in nps if n.get("score", 0) >= 9)
    detractors = sum(1 for n in nps if n.get("score", 0) <= 6)
    nps_score = round(((promoters - detractors) / len(nps)) * 100) if nps else 0
    return {
        "total_orders": total,
        "completed_orders": completed,
        "paid_orders": paid,
        "conversion_rate": conversion,
        "nps_score": nps_score,
        "surveys_count": len(nps),
    }


# ─── SERVIR FRONTEND ───
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")

@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

# ──────── MAIN ────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
