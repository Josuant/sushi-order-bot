-- ==========================================================================
-- SUSHI ERIZO - Supabase SQL Schema (PostgreSQL)
-- ==========================================================================
-- Ejecutar esto en el Editor SQL de Supabase Dashboard.
-- Habilita Row Level Security (RLS) para que el frontend hable directo.

-- 1. USUARIOS
CREATE TABLE IF NOT EXISTS public.users (
    chat_id BIGINT PRIMARY KEY,
    username TEXT NOT NULL DEFAULT '',
    roles TEXT NOT NULL DEFAULT 'cliente',  -- coma-separado: cliente,chef,pm
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. PEDIDOS
CREATE TABLE IF NOT EXISTS public.orders (
    id BIGSERIAL PRIMARY KEY,
    customer_name TEXT NOT NULL DEFAULT '',
    customer_chat_id BIGINT,  -- sin FK constraint: usuarios pueden no estar registrados aún
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','preparing','ready','out_for_delivery','delivered','cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending','paid','failed','refunded')),
    payment_method TEXT DEFAULT '',
    payment_transaction_id TEXT DEFAULT '',
    subtotal REAL DEFAULT 0,
    delivery_fee REAL DEFAULT 35,
    total REAL DEFAULT 0,
    instructions TEXT DEFAULT '',
    delivery_address TEXT DEFAULT '',
    delivery_interior TEXT DEFAULT '',
    delivery_references TEXT DEFAULT '',
    wa_delivery_status TEXT DEFAULT 'read',
    driver_name TEXT DEFAULT '',
    delivery_eta TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 3. ITEMS DEL PEDIDO
CREATE TABLE IF NOT EXISTS public.order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT DEFAULT '',
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    exclusions JSONB DEFAULT '[]'::jsonb,   -- [{id, tag, isCritical}]
    extras JSONB DEFAULT '[]'::jsonb,        -- [{id, tag, price}]
    kitchen_note TEXT DEFAULT ''
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 4. INVENTARIO / INSUMOS
CREATE TABLE IF NOT EXISTS public.insumos (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    emoji TEXT DEFAULT '📦',
    unidad TEXT NOT NULL DEFAULT 'g',
    stock_inicial REAL NOT NULL DEFAULT 0,
    stock_actual REAL NOT NULL DEFAULT 0,
    consumo_teorico REAL DEFAULT 0,
    consumo_real REAL DEFAULT 0,
    stock_minimo REAL DEFAULT 0,
    precio REAL DEFAULT 0  -- precio unitario MXN
);
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;

-- 5. MERMAS
CREATE TABLE IF NOT EXISTS public.mermas (
    id BIGSERIAL PRIMARY KEY,
    insumo_id TEXT NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
    cantidad REAL NOT NULL,
    motivo TEXT DEFAULT '',
    registrado_por TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mermas ENABLE ROW LEVEL SECURITY;

-- 6. ENCUESTAS NPS
CREATE TABLE IF NOT EXISTS public.nps_surveys (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
    comment TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;

-- 7. REPARTIDORES
CREATE TABLE IF NOT EXISTS public.drivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT true
);
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- SEED DATA: INSUMOS INICIALES
-- ==========================================================================
INSERT INTO public.insumos (id, nombre, emoji, unidad, stock_inicial, stock_actual, consumo_teorico, consumo_real, stock_minimo, precio)
VALUES
    ('salmon',       'Salmón Fresco Premium',     '🍣', 'g',     5000, 5000, 2400, 2900, 500,  28),
    ('arroz',        'Arroz Sumeshi Japonés',      '🍚', 'g',     8000, 8000, 3600, 3800, 800,  4),
    ('aguacate',     'Aguacate Hass',              '🥑', 'ud',   20,   20,   12,   15,   4,    25),
    ('nori',         'Alga Nori Tostada',           '🍙', 'hojas', 48,   48,   22,   24,   50,   15),
    ('queso_crema',  'Queso Crema Philadelphia',    '🧀', 'g',     3000, 3000, 1200, 1380, 400,  12),
    ('atun',         'Atún Aleta Amarilla',         '🐟', 'g',     2000, 2000, 900,  960,  300,  32),
    ('pepino',       'Pepino Fresco',               '🥒', 'g',     2500, 2500, 800,  850,  300,  3),
    ('erizo',        'Erizo de Mar Fresco',         '🦔', 'g',     500,  500,  200,  220,  100,  120),
    ('camaron',      'Camarón Tempura',             '🦐', 'g',     1000, 1000, 400,  450,  150,  45),
    ('queso_crema',  'Queso Crema',                 '🧀', 'g',     2000, 2000, 800,  820,  300,  10)
ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- SEED DATA: REPARTIDORES
-- ==========================================================================
INSERT INTO public.drivers (id, name, phone, is_active)
VALUES
    ('alex_moto4', 'Alex Moto #4', '+52 55 1234 5678', true),
    ('luis_moto7', 'Luis Moto #7', '+52 55 8765 4321', true)
ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- ROW LEVEL SECURITY POLICIES
-- ==========================================================================

-- USERS: cada quien su perfil; chefs/pm ven todos (para notificar)
CREATE POLICY "users_select_own" ON public.users
    FOR SELECT USING (chat_id = current_setting('app.user_chat_id', true)::bigint OR
                      current_setting('app.user_role', true) IN ('chef', 'pm'));
CREATE POLICY "users_insert_own" ON public.users
    FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update_own" ON public.users
    FOR UPDATE USING (chat_id = current_setting('app.user_chat_id', true)::bigint);

-- ORDERS: clientes ven sus pedidos; chefs/pm ven todos
CREATE POLICY "orders_select" ON public.orders
    FOR SELECT USING (customer_chat_id = current_setting('app.user_chat_id', true)::bigint OR
                      current_setting('app.user_role', true) IN ('chef', 'pm', 'driver'));
CREATE POLICY "orders_insert" ON public.orders
    FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update_chef" ON public.orders
    FOR UPDATE USING (current_setting('app.user_role', true) IN ('chef', 'pm'));

-- ORDER_ITEMS: mismas reglas que orders (cascade)
CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM orders WHERE id = order_id AND
                (customer_chat_id = current_setting('app.user_chat_id',true)::bigint OR
                 current_setting('app.user_role',true) IN ('chef','pm')))
    );
CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT WITH CHECK (true);

-- INSUMOS: solo chefs/pm pueden modificar
CREATE POLICY "insumos_select" ON public.insumos
    FOR SELECT USING (true);
CREATE POLICY "insumos_insert" ON public.insumos
    FOR INSERT WITH CHECK (current_setting('app.user_role', true) IN ('chef', 'pm'));
CREATE POLICY "insumos_update" ON public.insumos
    FOR UPDATE USING (current_setting('app.user_role', true) IN ('chef', 'pm'));

-- MERMAS: chefs/pm pueden gestionar
CREATE POLICY "mermas_select" ON public.mermas
    FOR SELECT USING (current_setting('app.user_role', true) IN ('chef', 'pm'));
CREATE POLICY "mermas_insert" ON public.mermas
    FOR INSERT WITH CHECK (current_setting('app.user_role', true) IN ('chef', 'pm'));

-- ==========================================================================
-- FUNCIÓN AUXILIAR: auto-update updated_at
-- ==========================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
