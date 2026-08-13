import sqlite3
import os
from datetime import datetime, timezone

DB_PATH = os.environ.get("DB_PATH", "/data/orders.db")

PRICES = {
    "Maki": 50,
    "Nigiri": 60,
    "Sushi Vegano": 65,
    "Uramaki": 70,
    "Temaki": 80,
    "Sashimi": 90,
    "Onigiri": 40,
}


def get_connection():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            customer_chat_id INTEGER,
            ingredients TEXT DEFAULT '',
            instructions TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            total REAL DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            sushi_type TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            ingredients TEXT DEFAULT '',
            unit_price REAL DEFAULT 0,
            subtotal REAL DEFAULT 0,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            chat_id INTEGER PRIMARY KEY,
            username TEXT,
            roles TEXT DEFAULT 'cliente',
            registered_at TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def save_order(order_data: dict, customer_chat_id: int = None) -> int:
    conn = get_connection()
    items = order_data.get("items", [])
    total = sum(item.get("subtotal", 0) for item in items)
    ingredients = ", ".join(order_data.get("ingredients", []))
    cursor = conn.execute(
        """INSERT INTO orders (customer_name, customer_chat_id, ingredients, instructions, status, total, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)""",
        (
            order_data.get("customer_name", ""),
            customer_chat_id,
            ingredients,
            order_data.get("instructions", ""),
            total,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    order_id = cursor.lastrowid
    for item in items:
        conn.execute(
            """INSERT INTO order_items (order_id, sushi_type, quantity, ingredients, unit_price, subtotal)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                order_id,
                item.get("sushi_type", ""),
                item.get("quantity", 1),
                ", ".join(item.get("ingredients", [])),
                item.get("unit_price", 0),
                item.get("subtotal", 0),
            ),
        )
    conn.commit()
    return order_id


def get_order_by_id(order_id: int) -> dict:
    conn = get_connection()
    order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        return None
    order = dict(order)
    items = conn.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
    order["items"] = [dict(i) for i in items]
    return order


def get_pending_orders():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM orders WHERE status = 'pending' ORDER BY id DESC").fetchall()
    orders = []
    for row in rows:
        o = dict(row)
        items = conn.execute("SELECT * FROM order_items WHERE order_id = ?", (o["id"],)).fetchall()
        o["items"] = [dict(i) for i in items]
        orders.append(o)
    return orders


def get_all_orders(limit=50):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM orders ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    orders = []
    for row in rows:
        o = dict(row)
        items = conn.execute("SELECT * FROM order_items WHERE order_id = ?", (o["id"],)).fetchall()
        o["items"] = [dict(i) for i in items]
        orders.append(o)
    return orders


def update_order_status(order_id: int, status: str) -> bool:
    conn = get_connection()
    cursor = conn.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
    conn.commit()
    return cursor.rowcount > 0


def register_user(chat_id: int, username: str, roles: list) -> None:
    conn = get_connection()
    existing = conn.execute("SELECT roles FROM users WHERE chat_id = ?", (chat_id,)).fetchone()
    if existing:
        current_roles = set(existing["roles"].split(","))
        current_roles.update(roles)
        conn.execute(
            "UPDATE users SET roles = ?, username = ? WHERE chat_id = ?",
            (",".join(sorted(current_roles)), username, chat_id),
        )
    else:
        conn.execute(
            "INSERT INTO users (chat_id, username, roles, registered_at) VALUES (?, ?, ?, ?)",
            (chat_id, username, ",".join(sorted(roles)), datetime.now(timezone.utc).isoformat()),
        )
    conn.commit()


def get_user_roles(chat_id: int) -> list:
    conn = get_connection()
    row = conn.execute("SELECT roles FROM users WHERE chat_id = ?", (chat_id,)).fetchone()
    return row["roles"].split(",") if row else ["cliente"]


def has_role(chat_id: int, role: str) -> bool:
    return role in get_user_roles(chat_id)


def get_users_by_role(role: str) -> list:
    conn = get_connection()
    rows = conn.execute("SELECT chat_id, username FROM users WHERE roles LIKE ?", (f"%{role}%",)).fetchall()
    return [dict(r) for r in rows]