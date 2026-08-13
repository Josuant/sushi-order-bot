import sqlite3
import os
from datetime import datetime, timezone

DB_PATH = os.environ.get("DB_PATH", "/data/orders.db")


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
            sushi_type TEXT NOT NULL,
            ingredients TEXT DEFAULT '',
            quantity TEXT NOT NULL,
            instructions TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            created_at TEXT NOT NULL
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


def save_order(order_data: dict) -> int:
    conn = get_connection()
    cursor = conn.execute(
        """INSERT INTO orders (customer_name, sushi_type, ingredients, quantity, instructions, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)""",
        (
            order_data.get("customer_name", ""),
            order_data.get("sushi_type", ""),
            ", ".join(order_data.get("ingredients", [])),
            order_data.get("quantity", ""),
            order_data.get("instructions", ""),
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    return cursor.lastrowid


def get_pending_orders():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM orders WHERE status = 'pending' ORDER BY id DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def get_all_orders(limit=50):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM orders ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


def complete_order(order_id: int) -> bool:
    conn = get_connection()
    cursor = conn.execute("UPDATE orders SET status = 'completed' WHERE id = ?", (order_id,))
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