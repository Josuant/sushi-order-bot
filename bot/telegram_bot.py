import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from store import init_db, save_order, register_user, get_user_roles, has_role
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler, filters,
    ContextTypes, ConversationHandler, CallbackQueryHandler,
)

API_TOKEN = os.environ.get("TELEGRAM_API_TOKEN")
CHEF_USERNAME = os.environ.get("CHEF_USERNAME", "@Zeralve").lstrip("@").lower()
NOTION_API_KEY = os.environ.get("NOTION_API_KEY")
NOTION_DB_ID = os.environ.get("NOTION_DB_ID", "c5662e5e-6b07-4e48-a3ca-c1cd1c317667")
if not API_TOKEN:
    raise ValueError("TELEGRAM_API_TOKEN environment variable not set.")

# Estados del ConversationHandler (pedidos)
GET_CUSTOMER_NAME, GET_SUSHI_TYPE, GET_INGREDIENTS, GET_QUANTITY, GET_INSTRUCTIONS, CONFIRM_ORDER = range(6)

# ──────── MENSAJES ────────

WELCOME_TEXT = """
🍣 **Bienvenido a EriZushi Bot** 🍣

Sistema de pedidos de sushi + gestión de proyecto.

━━━━━━━━━━━━━━━━━
**👤 Roles disponibles**
━━━━━━━━━━━━━━━━━

**🟢 Cliente** — Hace pedidos de prueba y propone mejoras
  • `/start` — Iniciar pedido
  • `/propuesta <texto>` — Sugerir mejora

**👨‍🍳 Chef** — Recibe pedidos y propone HU
  • Todo lo de Cliente +
  • Recibe notificaciones de pedidos nuevos

**📋 PM** — Gestiona el proyecto
  • `/propuesta <texto>` — Crear HU
  • `/aceptar <ID>` — Aceptar HU (cambia a "Por hacer")
  • `/rechazar <ID>` — Rechazar HU (cambia a "Rechazada")
  • `/hu` — Listar HU pendientes

━━━━━━━━━━━━━━━━━
**📝 Registro**
━━━━━━━━━━━━━━━━━

Usa `/registrarme <rol>` para registrarte.
Puedes tener varios roles: `/registrarme cliente chef`

Ejemplo: `/registrarme pm` o `/registrarme chef pm`

━━━━━━━━━━━━━━━━━
**📊 Dashboard chef:** https://sushi-order-bot.fly.dev
**📋 Tablero Notion:** https://app.notion.com/p/c5662e5e6b074e48a3cac1cd1c317667
"""

NO_PERMISSION = "❌ No tienes permiso para usar este comando con tu rol actual."

# ──────── HELPERS ────────

def role_required(*roles):
    """Decorator-like check: returns True if user has any of the required roles."""
    def decorator(func):
        async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
            chat_id = update.effective_user.id
            user_roles = get_user_roles(chat_id)
            if not any(r in user_roles for r in roles):
                await update.message.reply_text(NO_PERMISSION)
                return
            return await func(update, context)
        return wrapper
    return decorator

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME_TEXT, parse_mode="Markdown")

# ──────── REGISTRO ────────

async def registrarme(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    valid_roles = {"cliente", "chef", "pm"}
    if not context.args:
        await update.message.reply_text(
            "Uso: `/registrarme <rol1> <rol2> ...`\n"
            "Roles disponibles: `cliente`, `chef`, `pm`\n"
            "Ej: `/registrarme cliente chef`",
            parse_mode="Markdown",
        )
        return
    roles = [r.lower() for r in context.args if r.lower() in valid_roles]
    if not roles:
        await update.message.reply_text(
            "Roles inválidos. Válidos: `cliente`, `chef`, `pm`",
            parse_mode="Markdown",
        )
        return
    chat_id = update.effective_user.id
    username = update.effective_user.username or update.effective_user.first_name
    register_user(chat_id, username, roles)
    await update.message.reply_text(
        f"✅ ¡Registrado como: `{', '.join(roles)}`!\n\n"
        f"Tus roles actuales: `{', '.join(get_user_roles(chat_id))}`",
        parse_mode="Markdown",
    )

async def misroles(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_user.id
    roles = get_user_roles(chat_id)
    username = update.effective_user.username or update.effective_user.first_name
    await update.message.reply_text(
        f"👤 **{username}**\nRoles: `{', '.join(roles)}`",
        parse_mode="Markdown",
    )

# ──────── PEDIDOS (SOLO CLIENTE/CHEF) ────────

async def pedido_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    chat_id = update.effective_user.id
    if not has_role(chat_id, "cliente") and not has_role(chat_id, "chef"):
        await update.message.reply_text("❌ No tienes rol de Cliente o Chef. Usa `/registrarme cliente`")
        return ConversationHandler.END
    await update.message.reply_text("¿Cuál es el nombre del cliente?")
    context.user_data.clear()
    return GET_CUSTOMER_NAME

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Pedido cancelado.")
    context.user_data.clear()
    return ConversationHandler.END

async def get_customer_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["order_data"] = {"customer_name": update.message.text}
    sushi_options = [["Maki", "Nigiri", "Uramaki"], ["Temaki", "Sashimi", "Onigiri"]]
    keyboard = [[InlineKeyboardButton(o, callback_data=o) for o in row] for row in sushi_options]
    await update.message.reply_text("¿Qué tipo de sushi?", reply_markup=InlineKeyboardMarkup(keyboard))
    return GET_SUSHI_TYPE

async def handle_sushi_selection(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    context.user_data["order_data"]["sushi_type"] = query.data
    await query.edit_message_text("¿Algún ingrediente extra? (ej: aguacate, salmón). Si no, 'ninguno'.")
    return GET_INGREDIENTS

async def get_ingredients(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    ingredients = [i.strip() for i in text.split(",") if i.strip().lower() != "ninguno"]
    context.user_data["order_data"]["ingredients"] = ingredients
    await update.message.reply_text("¿Cuántas porciones?")
    return GET_QUANTITY

async def get_quantity(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["order_data"]["quantity"] = update.message.text
    await update.message.reply_text("¿Instrucciones especiales? Si no, 'ninguna'.")
    return GET_INSTRUCTIONS

async def get_instructions(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    context.user_data["order_data"]["instructions"] = "" if text.lower() == "ninguna" else text
    data = context.user_data["order_data"]
    msg = f"🍣 **Pedido**\nCliente: {data.get('customer_name')}\nTipo: {data.get('sushi_type')}\nExtras: {', '.join(data.get('ingredients',[])) or 'Ninguno'}\nCant: {data.get('quantity')}"
    if data.get("instructions"):
        msg += f"\nInstrucciones: {data['instructions']}"
    keyboard = [
        [InlineKeyboardButton("✅ Confirmar", callback_data="confirm")],
        [InlineKeyboardButton("❌ Cancelar", callback_data="cancel_order")],
    ]
    await update.message.reply_text(msg + "\n\n¿Confirmar?", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
    return CONFIRM_ORDER

async def confirm_order(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    data = context.user_data["order_data"]
    msg = f"🍣 **Nuevo Pedido de Sushi** 🍣\n\n**Cliente:** {data.get('customer_name')}\n**Tipo:** {data.get('sushi_type')}\n**Extras:** {', '.join(data.get('ingredients',[])) or 'Ninguno'}\n**Cantidad:** {data.get('quantity')}"
    if data.get("instructions"):
        msg += f"\n**Instrucciones:** {data['instructions']}"
    msg += "\n\n¡A preparar! 👨‍🍳"

    try:
        save_order(data)
    except Exception as e:
        print(f"DB error: {e}")

    chefs = [{'chat_id': u['chat_id']} for u in __import__('store', fromlist=['get_users_by_role']).get_users_by_role("chef")]
    sent = False
    for chef in chefs:
        try:
            await context.bot.send_message(chat_id=chef["chat_id"], text=msg, parse_mode="Markdown")
            sent = True
        except Exception:
            pass
    if not sent:
        try:
            await context.bot.send_message(chat_id=f"@{CHEF_USERNAME}", text=msg, parse_mode="Markdown")
        except Exception:
            pass

    await query.edit_message_text("✅ ¡Pedido enviado al chef! Gracias 🍣")
    context.user_data.clear()
    return ConversationHandler.END

async def handle_confirmation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    if query.data == "cancel_order":
        await query.edit_message_text("Pedido cancelado.")
        context.user_data.clear()
        return ConversationHandler.END
    return await confirm_order(update, context)

# ──────── PROPUESTA (todos roles) ────────

async def propuesta(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = " ".join(context.args) if context.args else None
    if not text:
        await update.message.reply_text("Uso: `/propuesta <descripción>`", parse_mode="Markdown")
        return
    if not NOTION_API_KEY:
        await update.message.reply_text("❌ Notion no configurado.")
        return

    chat_id = update.effective_user.id
    user_roles = get_user_roles(chat_id)
    tipo = "Mejora" if "cliente" in user_roles else "Historia de usuario"

    try:
        import httpx
        async with httpx.AsyncClient() as client:
            payload = {
                "parent": {"database_id": NOTION_DB_ID},
                "properties": {
                    "Name": {"title": [{"text": {"content": text[:2000]}}]},
                    "Estado": {"select": {"name": "Propuesta"}},
                    "Prioridad": {"select": {"name": "Media"}},
                    "Tipo": {"select": {"name": tipo}},
                    "Propuesto por": {
                        "rich_text": [{"text": {"content": f"@{update.effective_user.username or update.effective_user.first_name}"}}]
                    },
                },
            }
            resp = await client.post(
                "https://api.notion.com/v1/pages",
                headers={
                    "Authorization": f"Bearer {NOTION_API_KEY}",
                    "Notion-Version": "2025-09-03",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=15,
            )
            data = resp.json()
        if resp.status_code == 200:
            await update.message.reply_text(
                f"✅ ¡Propuesta registrada como **{tipo}**!\n📝 \"{text[:100]}{'...' if len(text)>100 else ''}\"",
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text(f"❌ Error: {data.get('message', 'desconocido')}")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")

# ──────── ACEPTAR / RECHAZAR HU (SOLO PM) ────────

async def aceptar(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_user.id
    if not has_role(chat_id, "pm"):
        await update.message.reply_text(NO_PERMISSION)
        return
    if not context.args or not context.args[0].isdigit():
        await update.message.reply_text("Uso: `/aceptar <ID>` — obtené el ID con `/hu`", parse_mode="Markdown")
        return
    page_id = context.args[0]
    await _update_notion_status(update, page_id, "Por hacer", "✅ HU aceptada → movida a **Por hacer**")

async def rechazar(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_user.id
    if not has_role(chat_id, "pm"):
        await update.message.reply_text(NO_PERMISSION)
        return
    if not context.args or not context.args[0]:
        await update.message.reply_text("Uso: `/rechazar <ID>`")
        return
    page_id = context.args[0]
    await _update_notion_status(update, page_id, "Rechazada", "❌ HU rechazada → movida a **Rechazada**")

async def _update_notion_status(update: Update, page_id: str, status: str, success_msg: str) -> None:
    if not NOTION_API_KEY:
        await update.message.reply_text("❌ Notion no configurado.")
        return
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"https://api.notion.com/v1/pages/{page_id}",
                headers={
                    "Authorization": f"Bearer {NOTION_API_KEY}",
                    "Notion-Version": "2025-09-03",
                    "Content-Type": "application/json",
                },
                json={"properties": {"Estado": {"select": {"name": status}}}},
                timeout=15,
            )
        if resp.status_code == 200:
            await update.message.reply_text(success_msg, parse_mode="Markdown")
        else:
            data = resp.json()
            await update.message.reply_text(f"❌ Error: {data.get('message', 'desconocido')}")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")

# ──────── LISTAR HU (SOLO PM) ────────

async def hu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_user.id
    if not has_role(chat_id, "pm"):
        await update.message.reply_text(NO_PERMISSION)
        return
    if not NOTION_API_KEY:
        await update.message.reply_text("❌ Notion no configurado.")
        return
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            ds_id = "edbe8b1c-82a2-451e-9d21-d509aa8cf279"
            resp = await client.post(
                f"https://api.notion.com/v1/data_sources/{ds_id}/query",
                headers={
                    "Authorization": f"Bearer {NOTION_API_KEY}",
                    "Notion-Version": "2025-09-03",
                    "Content-Type": "application/json",
                },
                json={"page_size": 20},
                timeout=15,
            )
            data = resp.json()
        if resp.status_code != 200:
            await update.message.reply_text(f"❌ Error: {data.get('message', '')}")
            return
        lines = []
        for r in data.get("results", []):
            props = r.get("properties", {})
            title = props.get("Name", {}).get("title", [{}])[0].get("text", {}).get("content", "?")
            estado = props.get("Estado", {}).get("select", {}).get("name", "?")
            tipo = props.get("Tipo", {}).get("select", {}).get("name", "?")
            page_id = r["id"][:12]
            lines.append(f"`{page_id}` | [{estado}] {tipo}: {title[:60]}")
        if not lines:
            await update.message.reply_text("No hay registros en Notion.")
        else:
            await update.message.reply_text(
                "📋 **Historias de Usuario**\n\n" + "\n".join(lines) + "\n\nUsa `/aceptar <ID>` o `/rechazar <ID>`",
                parse_mode="Markdown",
            )
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {e}")

# ──────── CHEF ────────

async def chef_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_user.id
    register_user(chat_id, update.effective_user.username or update.effective_user.first_name, ["chef"])
    await update.message.reply_text("👨‍🍳 ¡Registrado como chef! Recibirás los pedidos aquí.")

# ──────── ERROR ────────

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    print(f'Update "{update}" caused error "{context.error}"')

# ──────── MAIN ────────

def main() -> None:
    init_db()
    app = Application.builder().token(API_TOKEN).build()

    # Comandos generales
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("registrarme", registrarme))
    app.add_handler(CommandHandler("misroles", misroles))
    app.add_handler(CommandHandler("propuesta", propuesta))
    app.add_handler(CommandHandler("chef", chef_command))

    # Comandos solo PM
    app.add_handler(CommandHandler("aceptar", aceptar))
    app.add_handler(CommandHandler("rechazar", rechazar))
    app.add_handler(CommandHandler("hu", hu))

    # ConversationHandler para pedidos (solo cliente/chef)
    states = {
        GET_CUSTOMER_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_customer_name), CommandHandler("cancel", cancel)],
        GET_SUSHI_TYPE: [CallbackQueryHandler(handle_sushi_selection, pattern="^(Maki|Nigiri|Uramaki|Temaki|Sashimi|Onigiri)$"), MessageHandler(filters.COMMAND, cancel)],
        GET_INGREDIENTS: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_ingredients), CommandHandler("cancel", cancel)],
        GET_QUANTITY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_quantity), CommandHandler("cancel", cancel)],
        GET_INSTRUCTIONS: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_instructions), CommandHandler("cancel", cancel)],
        CONFIRM_ORDER: [CallbackQueryHandler(handle_confirmation, pattern="^(confirm|cancel_order)$"), CommandHandler("cancel", cancel)],
    }
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("pedido", pedido_start)],
        states=states,
        fallbacks=[CommandHandler("cancel", cancel)],
        allow_reentry=True,
    )
    app.add_handler(conv_handler)
    app.add_handler(MessageHandler(filters.COMMAND, lambda u, c: u.message.reply_text("Comando no reconocido. Usa /start para ver los disponibles.")))
    app.add_error_handler(error_handler)

    print("Bot iniciado con roles.")
    app.run_polling(poll_interval=2)

if __name__ == "__main__":
    main()