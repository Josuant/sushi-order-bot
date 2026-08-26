"""
Bot de Telegram — EriZushi (clientes)
Al /start presenta el restaurante y empieza a tomar la orden.
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] bot: %(message)s", datefmt="%Y-%m-%dT%H:%M:%S")
log = logging.getLogger("sushi-bot")

if not API_TOKEN:
    raise ValueError("TELEGRAM_API_TOKEN environment variable not set.")

PRICES = {
    "Maki": 50, "Nigiri": 60, "Sushi Vegano": 65, "Uramaki": 70,
    "Temaki": 80, "Sashimi": 90, "Onigiri": 40,
}

(GET_CUSTOMER_NAME, GET_SUSHI_TYPE, GET_INGREDIENTS, GET_QUANTITY,
 GET_ADD_MORE, GET_INSTRUCTIONS, CONFIRM_ORDER) = range(7)

WELCOME = """🍣 **EriZushi** — Sushi artesanal 🍣

*Rollos frescos, ingredientes de primera, 
preparados al momento por nuestro chef.*

📍 Córdoba, Argentina
🕐 Abierto L-D 19:00–00:00

━━━━━━━━━━━━━━━━━
**📋 Menú**
━━━━━━━━━━━━━━━━━
""" + "\n".join(f"• {n}: **${p}**/pieza" for n, p in PRICES.items()) + """

━━━━━━━━━━━━━━━━━
¿Empezamos con tu pedido? Primero, ¿cuál es tu nombre?"""


# ─── HANDLERS ───

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    context.user_data["cart"] = []
    context.user_data["customer_chat_id"] = update.effective_user.id
    await update.message.reply_text(WELCOME, parse_mode="Markdown")
    return GET_CUSTOMER_NAME


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("❌ Pedido cancelado. Si quieres otro, /start")
    context.user_data.clear()
    return ConversationHandler.END


def build_menu_keyboard():
    keyboard = [[InlineKeyboardButton(f"{name} ${price}", callback_data=name)] for name, price in PRICES.items()]
    return InlineKeyboardMarkup(keyboard)


async def get_customer_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["customer_name"] = update.message.text
    await update.message.reply_text(
        f"¡Hola {update.message.text}! 🙌\n\nElige tu primer sushi:",
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
    await update.message.reply_text("¿Cuántas piezas querés?")
    return GET_QUANTITY


async def get_quantity(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    try:
        qty = int(text)
    except ValueError:
        await update.message.reply_text("Ingresa un número (ej: 2, 5).")
        return GET_QUANTITY
    sushi = context.user_data["current_sushi"]
    unit_price = PRICES.get(sushi, 0)
    subtotal = unit_price * qty
    item = {"sushi_type": sushi, "quantity": qty, "unit_price": unit_price, "subtotal": subtotal}
    context.user_data["cart"].append(item)
    context.user_data["current_sushi"] = None
    cart_total = sum(i["subtotal"] for i in context.user_data["cart"])
    keyboard = [
        [InlineKeyboardButton("✅ Agregar otro", callback_data="add_more")],
        [InlineKeyboardButton("🏁 Terminar", callback_data="finish_cart")],
    ]
    await update.message.reply_text(
        f"✅ {sushi} x{qty} = **${subtotal}**\n"
        f"🛒 Total parcial: **${cart_total}**\n\n¿Algo más?",
        reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown",
    )
    return GET_ADD_MORE


async def handle_add_more(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    if query.data == "add_more":
        await query.edit_message_text(
            "¿Qué otro sushi querés?",
            reply_markup=build_menu_keyboard(), parse_mode="Markdown"
        )
        return GET_SUSHI_TYPE
    await query.edit_message_text("¿Alguna instrucción especial? Si no, 'ninguna'.")
    return GET_INSTRUCTIONS


async def get_instructions(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    context.user_data["instructions"] = "" if text.lower() == "ninguna" else text
    cart = context.user_data["cart"]
    total = sum(i["subtotal"] for i in cart)
    lines = [f"• {i['sushi_type']} x{i['quantity']} — ${i['subtotal']}" for i in cart]
    msg = f"🍣 **Tu pedido**\nCliente: {context.user_data.get('customer_name')}\n\n" + "\n".join(lines)
    msg += f"\n\n💰 **Total: ${total}**"
    if context.user_data.get("instructions"):
        msg += f"\n📝 _{context.user_data['instructions']}_"
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

    order_id = None
    if BACKEND_URL:
        try:
            async with httpx.AsyncClient() as c:
                payload = {
                    "customer_name": context.user_data.get("customer_name", ""),
                    "customer_chat_id": context.user_data.get("customer_chat_id"),
                    "instructions": context.user_data.get("instructions", ""),
                    "items": [{
                        "name": i["sushi_type"],
                        "quantity": i["quantity"],
                        "unit_price": i["unit_price"],
                        "subtotal": i["subtotal"],
                    } for i in cart],
                    "subtotal": total,
                    "delivery_fee": 35,
                }
                r = await c.post(f"{BACKEND_URL}/api/orders", json=payload, timeout=15)
                if r.status_code == 200:
                    result = r.json()
                    order_id = result.get("id")
                    log.info("Pedido #%s creado", order_id)
                else:
                    log.error("Backend respondió %s: %s", r.status_code, r.text[:300])
        except Exception as e:
            log.error("Error creando pedido: %s", e)

    msg = "✅ **¡Pedido confirmado!** 🎉\n\n"
    msg += "Te vamos a notificar cuando:\n"
    msg += "👨‍🍳 Esté en preparación\n"
    msg += "🛵 Salga para reparto\n"
    msg += "🎉 Se entregue\n\n"
    msg += f"📋 **#ID: {order_id}**" if order_id else "📋 **#ID: PENDIENTE**"
    msg += "\n\n💡 *Podés hacer otro pedido con /start*"

    await query.edit_message_text(msg, parse_mode="Markdown")
    context.user_data.clear()
    return ConversationHandler.END


async def handle_confirmation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    if query.data == "cancel_order":
        await query.edit_message_text("❌ Pedido cancelado. /start para uno nuevo.")
        context.user_data.clear()
        return ConversationHandler.END
    return await confirm_order(update, context)


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    log.error('Update "%s" caused error "%s"', update, context.error)


# ─── MAIN ───

def main() -> None:
    app = Application.builder().token(API_TOKEN).build()

    states = {
        GET_CUSTOMER_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_customer_name), CommandHandler("cancelar", cancel)],
        GET_SUSHI_TYPE: [CallbackQueryHandler(handle_sushi_selection, pattern="^(Maki|Nigiri|Uramaki|Temaki|Sashimi|Onigiri)$")],
        GET_INGREDIENTS: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_ingredients), CommandHandler("cancelar", cancel)],
        GET_QUANTITY: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_quantity), CommandHandler("cancelar", cancel)],
        GET_ADD_MORE: [CallbackQueryHandler(handle_add_more, pattern="^(add_more|finish_cart)$")],
        GET_INSTRUCTIONS: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_instructions), CommandHandler("cancelar", cancel)],
        CONFIRM_ORDER: [CallbackQueryHandler(handle_confirmation, pattern="^(confirm|cancel_order)$")],
    }
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states=states,
        fallbacks=[CommandHandler("cancelar", cancel)],
        allow_reentry=True,
    )
    app.add_handler(conv_handler)
    app.add_error_handler(error_handler)

    log.info("Bot iniciado — pedidos EriZushi.")
    app.run_polling(poll_interval=2)


if __name__ == "__main__":
    main()