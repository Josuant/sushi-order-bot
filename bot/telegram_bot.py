"""
Bot de Telegram — EriZushi (solo clientes)
Flujo: /pedido → elige sushi → ingredientes → cantidad → confirma
El backend notifica a chefs y al cliente automáticamente.
"""
import os, sys, json, logging
import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler, filters,
    ContextTypes, ConversationHandler, CallbackQueryHandler,
)

API_TOKEN = os.environ.get("TELEGRAM_API_TOKEN")
BACKEND_URL = os.environ.get("BACKEND_URL", "")

# ──────── LOGGING ────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] bot: %(message)s", datefmt="%Y-%m-%dT%H:%M:%S")
log = logging.getLogger("sushi-bot")

if not API_TOKEN:
    raise ValueError("TELEGRAM_API_TOKEN environment variable not set.")

# ─── PRECIOS ───
PRICES = {
    "Maki": 50, "Nigiri": 60, "Sushi Vegano": 65, "Uramaki": 70,
    "Temaki": 80, "Sashimi": 90, "Onigiri": 40,
}

# Estados del ConversationHandler
(GET_CUSTOMER_NAME, GET_SUSHI_TYPE, GET_INGREDIENTS, GET_QUANTITY,
 GET_ADD_MORE, GET_INSTRUCTIONS, CONFIRM_ORDER) = range(7)

WELCOME_TEXT = """🍣 **Bienvenido a EriZushi Bot** 🍣

Haz tu pedido de sushi directamente desde aquí.

━━━━━━━━━━━━━━━━━
**📋 Comandos**
━━━━━━━━━━━━━━━━━

• `/pedido` — Iniciar un nuevo pedido
• `/menu` — Ver precios del menú
• `/cancelar` — Cancelar pedido en curso

━━━━━━━━━━━━━━━━━
Al confirmar tu pedido recibirás
notificaciones del estado en este chat.
━━━━━━━━━━━━━━━━━"""

MENU_TEXT = "🍣 **Menú EriZushi** 🍣\n\n" + "\n".join(
    [f"• {name}: **${price}**/pieza" for name, price in PRICES.items()]
)


# ─── HANDLERS ───

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME_TEXT, parse_mode="Markdown")


async def menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(MENU_TEXT, parse_mode="Markdown")


async def pedido_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    context.user_data["cart"] = []
    context.user_data["customer_chat_id"] = update.effective_user.id
    await update.message.reply_text("¿Cuál es el nombre del cliente?")
    return GET_CUSTOMER_NAME


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Pedido cancelado.")
    context.user_data.clear()
    return ConversationHandler.END


def build_menu_keyboard():
    keyboard = [[InlineKeyboardButton(f"{name} ${price}", callback_data=name)] for name, price in PRICES.items()]
    return InlineKeyboardMarkup(keyboard)


async def get_customer_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["customer_name"] = update.message.text
    await update.message.reply_text(
        MENU_TEXT + "\n\n¿Qué tipo de sushi agregas al pedido?",
        reply_markup=build_menu_keyboard(), parse_mode="Markdown"
    )
    return GET_SUSHI_TYPE


async def handle_sushi_selection(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    context.user_data["current_sushi"] = query.data
    await query.edit_message_text(
        f"**{query.data}** (${PRICES[query.data]}/pieza)\n\n¿Algún ingrediente extra? (ej: aguacate, salmón). Si no, 'ninguno'.",
        parse_mode="Markdown",
    )
    return GET_INGREDIENTS


async def get_ingredients(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    ingredients = [i.strip() for i in text.split(",") if i.strip().lower() != "ninguno"]
    context.user_data["current_ingredients"] = ingredients
    await update.message.reply_text("¿Cuántas piezas deseas?")
    return GET_QUANTITY


async def get_quantity(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    try:
        qty = int(text)
    except ValueError:
        await update.message.reply_text("Ingresa un número válido (ej: 2, 5, 10).")
        return GET_QUANTITY
    sushi = context.user_data["current_sushi"]
    ingredients = context.user_data.get("current_ingredients", [])
    unit_price = PRICES.get(sushi, 0)
    subtotal = unit_price * qty
    item = {"sushi_type": sushi, "quantity": qty, "ingredients": ingredients, "unit_price": unit_price, "subtotal": subtotal}
    context.user_data["cart"].append(item)
    context.user_data["current_sushi"] = None
    context.user_data["current_ingredients"] = []
    cart_total = sum(i["subtotal"] for i in context.user_data["cart"])
    keyboard = [
        [InlineKeyboardButton("✅ Sí, agregar otro", callback_data="add_more")],
        [InlineKeyboardButton("🏁 Terminar pedido", callback_data="finish_cart")],
    ]
    await update.message.reply_text(
        f"✅ Agregado: {sushi} x{qty} = **${subtotal}**\n\n"
        f"🛒 **Carrito ({len(context.user_data['cart'])} artículos)**\n"
        f"Total actual: **${cart_total}**\n\n"
        f"¿Agregar otro artículo?",
        reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown",
    )
    return GET_ADD_MORE


async def handle_add_more(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    if query.data == "add_more":
        await query.edit_message_text(
            MENU_TEXT + "\n\n¿Qué otro artículo agregas?",
            reply_markup=build_menu_keyboard(), parse_mode="Markdown"
        )
        return GET_SUSHI_TYPE
    else:
        await query.edit_message_text("¿Alguna instrucción especial? Si no, 'ninguna'.")
        return GET_INSTRUCTIONS


async def get_instructions(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    context.user_data["instructions"] = "" if text.lower() == "ninguna" else text
    cart = context.user_data["cart"]
    total = sum(i["subtotal"] for i in cart)
    lines = [f"• {i['sushi_type']} x{i['quantity']} — ${i['subtotal']}" for i in cart]
    msg = f"🍣 **Resumen del pedido**\nCliente: {context.user_data.get('customer_name')}\n\n"
    msg += "\n".join(lines)
    msg += f"\n\n💰 **TOTAL: ${total}**"
    if context.user_data.get("instructions"):
        msg += f"\n📝 Instrucciones: {context.user_data['instructions']}"
    keyboard = [[InlineKeyboardButton("✅ Confirmar", callback_data="confirm")],
                [InlineKeyboardButton("❌ Cancelar", callback_data="cancel_order")]]
    await update.message.reply_text(
        msg + "\n\n¿Confirmar?", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown"
    )
    return CONFIRM_ORDER


async def confirm_order(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    cart = context.user_data.get("cart", [])
    total = sum(i["subtotal"] for i in cart)

    order_data = {
        "customer_name": context.user_data.get("customer_name", ""),
        "customer_chat_id": context.user_data.get("customer_chat_id"),
        "instructions": context.user_data.get("instructions", ""),
        "items": cart,
    }

    # Enviar al backend
    order_id = None
    if BACKEND_URL:
        try:
            async with httpx.AsyncClient() as c:
                payload = {
                    "customer_name": order_data["customer_name"],
                    "customer_chat_id": order_data["customer_chat_id"],
                    "instructions": order_data["instructions"],
                    "items": [{
                        "name": i["sushi_type"],
                        "quantity": i["quantity"],
                        "unit_price": i["unit_price"],
                        "subtotal": i["subtotal"],
                    } for i in order_data["items"]],
                    "subtotal": total,
                    "delivery_fee": 35,
                }
                log.info("POST %s/api/orders payload=%s", BACKEND_URL, json.dumps(payload)[:300])
                r = await c.post(f"{BACKEND_URL}/api/orders", json=payload, timeout=15)
                if r.status_code == 200:
                    result = r.json()
                    order_id = result.get("id")
                    log.info("Pedido #%s creado exitosamente", order_id)
                else:
                    log.error("Backend respondió %s: %s", r.status_code, r.text[:300])
        except Exception as e:
            log.error("Error creando pedido: %s", e)

    await query.edit_message_text(
        "✅ **¡Pedido enviado!** 🍣\n\n"
        "Recibirás notificaciones automáticas aquí cuando:\n"
        "👨‍🍳 Entre en preparación\n"
        "🛵 Esté en camino\n"
        "🎉 Sea entregado\n\n"
        f"📋 **#ID: {order_id or 'PENDIENTE'}**" if order_id else "📋 **#ID: PENDIENTE**",
        parse_mode="Markdown"
    )
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


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    log.error('Update "%s" caused error "%s"', update, context.error)


# ─── MAIN ───

def main() -> None:
    app = Application.builder().token(API_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("menu", menu))

    states = {
        GET_CUSTOMER_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_customer_name), CommandHandler("cancelar", cancel)],
        GET_SUSHI_TYPE: [CallbackQueryHandler(handle_sushi_selection, pattern="^(Maki|Nigiri|Uramaki|Temaki|Sashimi|Onigiri)$"), MessageHandler(filters.COMMAND, cancel)],
        GET_INGREDIENTS: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_ingredients), CommandHandler("cancelar", cancel)],
        GET_QUANTITY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_quantity), CommandHandler("cancelar", cancel)],
        GET_ADD_MORE: [CallbackQueryHandler(handle_add_more, pattern="^(add_more|finish_cart)$"), MessageHandler(filters.COMMAND, cancel)],
        GET_INSTRUCTIONS: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_instructions), CommandHandler("cancelar", cancel)],
        CONFIRM_ORDER: [CallbackQueryHandler(handle_confirmation, pattern="^(confirm|cancel_order)$"), CommandHandler("cancelar", cancel)],
    }
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("pedido", pedido_start)],
        states=states,
        fallbacks=[CommandHandler("cancelar", cancel)],
        allow_reentry=True,
    )
    app.add_handler(conv_handler)
    app.add_handler(MessageHandler(filters.COMMAND, lambda u, c: u.message.reply_text("Usa /start para ver los comandos.")))
    app.add_error_handler(error_handler)

    log.info("Bot iniciado — solo clientes.")
    app.run_polling(poll_interval=2)


if __name__ == "__main__":
    main()