import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    filters,
    ContextTypes,
    ConversationHandler,
    CallbackQueryHandler,
)

API_TOKEN = os.environ.get("TELEGRAM_API_TOKEN")
CHEF_USERNAME = os.environ.get("CHEF_USERNAME", "@Zeralve").lstrip("@").lower()
CHEF_CHAT_ID_ENV = os.environ.get("CHEF_CHAT_ID")

if not API_TOKEN:
    raise ValueError("TELEGRAM_API_TOKEN environment variable not set.")

(
    GET_CUSTOMER_NAME,
    GET_SUSHI_TYPE,
    GET_INGREDIENTS,
    GET_QUANTITY,
    GET_INSTRUCTIONS,
    CONFIRM_ORDER,
) = range(6)


def format_order(order_data):
    customer_name = order_data.get("customer_name", "N/A")
    sushi_type = order_data.get("sushi_type", "N/A")
    ingredients = order_data.get("ingredients", [])
    quantity = order_data.get("quantity", "N/A")
    instructions = order_data.get("instructions", "")

    msg = "🍣 **Nuevo Pedido de Sushi** 🍣\n\n"
    msg += f"**Cliente:** {customer_name}\n"
    msg += f"**Tipo:** {sushi_type}\n"
    msg += f"**Extras:** {', '.join(ingredients) if ingredients else 'Ninguno'}\n"
    msg += f"**Cantidad:** {quantity}\n"
    if instructions:
        msg += f"**Instrucciones:** {instructions}\n"
    msg += "\n¡A preparar! 👨‍🍳"
    return msg


def capture_chef_id(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Guarda automáticamente el chat_id numérico cuando el chef interactúa."""
    if update.message and update.message.from_user:
        username = update.message.from_user.username
        if username and username.lower() == CHEF_USERNAME:
            context.bot_data["chef_chat_id"] = update.message.chat.id


async def chef_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /chef para registrar manualmente al chef."""
    if update.message and update.message.from_user:
        context.bot_data["chef_chat_id"] = update.message.chat.id
        await update.message.reply_text(
            f"👨‍🍳 ¡Registrado como chef! Tu ID de chat es `{update.message.chat.id}`. Aquí recibirás los pedidos."
        )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    capture_chef_id(update, context)
    await update.message.reply_text(
        "¡Hola! Soy tu bot de pedidos de sushi. ¿Cuál es el nombre del cliente?"
    )
    context.user_data.clear()
    return GET_CUSTOMER_NAME


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    capture_chef_id(update, context)
    await update.message.reply_text("Pedido cancelado. ¡Hasta pronto!")
    context.user_data.clear()
    return ConversationHandler.END


async def get_customer_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    capture_chef_id(update, context)
    user_input = update.message.text
    context.user_data["order_data"] = {"customer_name": user_input}

    sushi_options = [
        ["Maki", "Nigiri", "Uramaki"],
        ["Temaki", "Sashimi", "Onigiri"],
    ]
    keyboard = [
        [InlineKeyboardButton(option, callback_data=option) for option in row]
        for row in sushi_options
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        f"Gracias, {user_input}. ¿Qué tipo de sushi deseas?", reply_markup=reply_markup
    )
    return GET_SUSHI_TYPE


async def handle_sushi_selection(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    sushi_type = query.data
    context.user_data["order_data"]["sushi_type"] = sushi_type

    await query.edit_message_text(
        text=f"Entendido, {sushi_type}. ¿Algún ingrediente o extra? (ej: aguacate, salmón extra). Si no, escribe 'ninguno'."
    )
    return GET_INGREDIENTS


async def get_ingredients(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    capture_chef_id(update, context)
    user_input = update.message.text
    ingredients = [
        ing.strip()
        for ing in user_input.split(",")
        if ing.strip().lower() != "ninguno"
    ]
    context.user_data["order_data"]["ingredients"] = ingredients

    await update.message.reply_text("Perfecto. ¿Cuántas porciones o unidades?")
    return GET_QUANTITY


async def get_quantity(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    capture_chef_id(update, context)
    user_input = update.message.text
    context.user_data["order_data"]["quantity"] = user_input

    await update.message.reply_text(
        "Anotado. ¿Instrucciones especiales para el chef? Si no, escribe 'ninguna'."
    )
    return GET_INSTRUCTIONS


async def get_instructions(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    capture_chef_id(update, context)
    user_input = update.message.text
    context.user_data["order_data"]["instructions"] = (
        user_input if user_input.lower() != "ninguna" else ""
    )

    summary = format_order(context.user_data["order_data"])

    keyboard = [
        [InlineKeyboardButton("✅ Confirmar", callback_data="confirm")],
        [InlineKeyboardButton("❌ Cancelar", callback_data="cancel_order")],
        [InlineKeyboardButton("✏️ Editar", callback_data="edit_order")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        f"Revisa tu pedido:\n\n{summary}\n\n¿Es correcto?", reply_markup=reply_markup
    )
    return CONFIRM_ORDER


async def confirm_order(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    order_data = context.user_data["order_data"]
    formatted_message = format_order(order_data)

    target_chat_id = (
        context.bot_data.get("chef_chat_id")
        or CHEF_CHAT_ID_ENV
        or f"@{CHEF_USERNAME}"
    )

    try:
        await context.bot.send_message(
            chat_id=target_chat_id, text=formatted_message, parse_mode="Markdown"
        )
        await query.edit_message_text(
            text="¡Pedido confirmado y enviado al chef! Gracias 🍣"
        )
    except Exception as e:
        await query.edit_message_text(
            text=f"Error al enviar al chef: {e}. Asegúrate de que el chef haya iniciado el bot enviando /chef o /start."
        )

    context.user_data.clear()
    return ConversationHandler.END


async def edit_order(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    await query.edit_message_text(
        text="Reiniciando pedido. Escribe /start para comenzar de nuevo."
    )
    context.user_data.clear()
    return ConversationHandler.END


async def handle_confirmation_actions(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    query = update.callback_query
    await query.answer()

    action = query.data

    if action == "confirm":
        return await confirm_order(update, context)
    elif action == "cancel_order":
        await query.edit_message_text(text="Pedido cancelado. ¡Hasta pronto!")
        context.user_data.clear()
        return ConversationHandler.END
    elif action == "edit_order":
        return await edit_order(update, context)

    return CONFIRM_ORDER


async def handle_unknown_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    capture_chef_id(update, context)
    await update.message.reply_text(
        "No entendí ese comando. Usa /start para iniciar un pedido."
    )


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    print(f'Update "{update}" caused error "{context.error}"')


def main() -> None:
    application = Application.builder().token(API_TOKEN).build()

    states = {
        GET_CUSTOMER_NAME: [
            MessageHandler(filters.TEXT & ~filters.COMMAND, get_customer_name),
            CommandHandler("cancel", cancel),
        ],
        GET_SUSHI_TYPE: [
            CallbackQueryHandler(
                handle_sushi_selection,
                pattern="^(Maki|Nigiri|Uramaki|Temaki|Sashimi|Onigiri)$",
            ),
            MessageHandler(filters.COMMAND, cancel),
        ],
        GET_INGREDIENTS: [
            MessageHandler(filters.TEXT & ~filters.COMMAND, get_ingredients),
            CommandHandler("cancel", cancel),
        ],
        GET_QUANTITY: [
            MessageHandler(filters.TEXT & ~filters.COMMAND, get_quantity),
            CommandHandler("cancel", cancel),
        ],
        GET_INSTRUCTIONS: [
            MessageHandler(filters.TEXT & ~filters.COMMAND, get_instructions),
            CommandHandler("cancel", cancel),
        ],
        CONFIRM_ORDER: [
            CallbackQueryHandler(
                handle_confirmation_actions,
                pattern="^(confirm|cancel_order|edit_order)$",
            ),
            CommandHandler("cancel", cancel),
        ],
    }

    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states=states,
        fallbacks=[CommandHandler("cancel", cancel)],
        allow_reentry=True,
    )

    application.add_handler(CommandHandler("chef", chef_command))
    application.add_handler(conv_handler)
    application.add_handler(MessageHandler(filters.COMMAND, handle_unknown_command))
    application.add_error_handler(error_handler)

    print("Bot iniciado. Esperando mensajes...")
    application.run_polling(poll_interval=2)


if __name__ == "__main__":
    main()
