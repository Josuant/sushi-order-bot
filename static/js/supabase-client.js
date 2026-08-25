/**
 * Cliente de Integración Supabase (PostgreSQL Serverless) & Almacenamiento Híbrido
 * Ecosistema Sushi Erizo
 * 
 * Soporta conexión directa a la API REST de Supabase con fallback transparente
 * a localStorage para garantizar alta disponibilidad incluso sin conexión.
 */

import { INSUMOS_DATA, INITIAL_MERMAS } from './insumos-data.js';

export class SupabaseInventoryClient {
  constructor() {
    this.storageKeyConfig = 'sushi_erizo_supabase_config';
    this.storageKeyInsumos = 'sushi_erizo_insumos_data';
    this.storageKeyMermas = 'sushi_erizo_mermas_data';

    this.defaultUrl = 'https://ylacekdmvpuvpnzjastn.supabase.co';
    this.defaultAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsYWNla2RtdnB1dnBuemphc3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MjcxNDQsImV4cCI6MjEwMzEwMzE0NH0.NhqATXg0cc1HKdT8_BMEmg5RPDJfk0_jBlMrZSL7s-o';

    this.url = this.defaultUrl;
    this.anonKey = this.defaultAnonKey;
    this.isConfigured = true;
    this.lastSyncStatus = 'connected'; // 'connected' | 'local' | 'error'

    this.loadStoredConfig();
  }

  /**
   * Carga credenciales guardadas en localStorage si existen (para permitir sobreescritura)
   */
  loadStoredConfig() {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.storageKeyConfig);
        if (stored) {
          const config = JSON.parse(stored);
          if (config.url && config.anonKey) {
            this.url = (config.url || '').trim().replace(/\/+$/, '');
            this.anonKey = (config.anonKey || '').trim();
          }
        }
      }
    } catch (e) {
      console.warn("No se pudo cargar la configuración de Supabase desde localStorage:", e);
    }
  }

  /**
   * Guarda o actualiza las credenciales de Supabase
   */
  saveConfig(url, anonKey) {
    this.url = (url || '').trim().replace(/\/+$/, '');
    this.anonKey = (anonKey || '').trim();
    this.isConfigured = !!(this.url && this.anonKey);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKeyConfig, JSON.stringify({
        url: this.url,
        anonKey: this.anonKey,
        savedAt: new Date().toISOString()
      }));
    }
  }

  /**
   * Elimina las credenciales y vuelve a modo local
   */
  clearConfig() {
    this.url = '';
    this.anonKey = '';
    this.isConfigured = false;
    this.lastSyncStatus = 'local';
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.storageKeyConfig);
    }
  }

  /**
   * Headers estándar de autenticación para llamadas PostgREST a Supabase
   */
  getHeaders() {
    return {
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.anonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  /**
   * Prueba de conexión en vivo con el proyecto de Supabase
   */
  async testConnection() {
    if (!this.isConfigured) {
      this.lastSyncStatus = 'local';
      return { success: false, mode: 'local', message: 'Sin credenciales configuradas (Operando en modo local).' };
    }

    try {
      const response = await fetch(`${this.url}/rest/v1/insumos?select=id&limit=1`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (response.ok) {
        this.lastSyncStatus = 'connected';
        return { success: true, mode: 'connected', message: '🟢 Conexión exitosa con Supabase PostgreSQL.' };
      } else {
        const errorText = await response.text();
        this.lastSyncStatus = 'error';
        return { 
          success: false, 
          mode: 'error', 
          message: `🔴 Error HTTP ${response.status}: ${errorText.includes('relation') ? 'Las tablas no existen aún. Ejecuta el script SQL en Supabase.' : 'Verifica la URL y Anon Key.'}` 
        };
      }
    } catch (err) {
      this.lastSyncStatus = 'error';
      return { success: false, mode: 'error', message: `🔴 Error de red: ${err.message}` };
    }
  }

  /**
   * Obtiene todos los insumos (desde Supabase si está conectado, o desde localStorage/datos iniciales)
   */
  async fetchInsumos() {
    if (this.isConfigured) {
      try {
        const response = await fetch(`${this.url}/rest/v1/insumos?select=*&order=nombre.asc`, {
          method: 'GET',
          headers: this.getHeaders()
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            // Mapear campos snake_case de SQL a camelCase de JS
            const mapped = data.map(row => this.sqlToInsumo(row));
            this.cacheLocalInsumos(mapped);
            this.lastSyncStatus = 'connected';
            return mapped;
          }
        }
      } catch (err) {
        console.warn("Fallo al consultar Supabase, usando respaldo local:", err);
      }
    }

    // Respaldo local
    return this.getLocalInsumos();
  }

  /**
   * Guarda o actualiza un insumo en Supabase y localmente
   */
  async upsertInsumo(insumo) {
    // 1. Guardar localmente
    const localList = this.getLocalInsumos();
    const idx = localList.findIndex(i => i.id === insumo.id);
    if (idx >= 0) {
      localList[idx] = { ...localList[idx], ...insumo };
    } else {
      localList.push(insumo);
    }
    this.cacheLocalInsumos(localList);

    // 2. Sincronizar con Supabase si está disponible
    if (this.isConfigured) {
      try {
        const sqlRow = this.insumoToSql(insumo);
        const response = await fetch(`${this.url}/rest/v1/insumos`, {
          method: 'POST',
          headers: {
            ...this.getHeaders(),
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(sqlRow)
        });

        if (response.ok) {
          this.lastSyncStatus = 'connected';
        }
      } catch (err) {
        console.warn("Fallo al guardar en Supabase:", err);
      }
    }

    return insumo;
  }

  /**
   * Guarda todo el catálogo de insumos en bloque
   */
  async saveAllInsumos(insumosArray) {
    this.cacheLocalInsumos(insumosArray);

    if (this.isConfigured) {
      try {
        const sqlRows = insumosArray.map(i => this.insumoToSql(i));
        const response = await fetch(`${this.url}/rest/v1/insumos`, {
          method: 'POST',
          headers: {
            ...this.getHeaders(),
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(sqlRows)
        });

        if (response.ok) {
          this.lastSyncStatus = 'connected';
          return { success: true, count: sqlRows.length };
        }
      } catch (err) {
        console.warn("Error al guardar lote en Supabase:", err);
      }
    }

    return { success: true, count: insumosArray.length, mode: 'local' };
  }

  /**
   * Elimina un insumo por ID
   */
  async deleteInsumo(insumoId) {
    const localList = this.getLocalInsumos().filter(i => i.id !== insumoId);
    this.cacheLocalInsumos(localList);

    if (this.isConfigured) {
      try {
        await fetch(`${this.url}/rest/v1/insumos?id=eq.${encodeURIComponent(insumoId)}`, {
          method: 'DELETE',
          headers: this.getHeaders()
        });
      } catch (err) {
        console.warn("Error al eliminar en Supabase:", err);
      }
    }

    return true;
  }

  /**
   * Obtiene la bitácora de mermas
   */
  async fetchMermas() {
    if (this.isConfigured) {
      try {
        const response = await fetch(`${this.url}/rest/v1/mermas?select=*&order=created_at.desc&limit=50`, {
          method: 'GET',
          headers: this.getHeaders()
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            const mapped = data.map(r => ({
              id: r.id,
              insumoId: r.insumo_id,
              cantidad: parseFloat(r.cantidad),
              motivo: r.motivo,
              hora: r.hora,
              createdAt: r.created_at
            }));
            this.cacheLocalMermas(mapped);
            return mapped;
          }
        }
      } catch (err) {
        console.warn("Error al obtener mermas de Supabase:", err);
      }
    }

    return this.getLocalMermas();
  }

  /**
   * Registra una nueva merma
   */
  async insertMerma(merma) {
    const localMermas = this.getLocalMermas();
    localMermas.unshift(merma);
    this.cacheLocalMermas(localMermas);

    if (this.isConfigured) {
      try {
        await fetch(`${this.url}/rest/v1/mermas`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            id: merma.id,
            insumo_id: merma.insumoId,
            cantidad: merma.cantidad,
            motivo: merma.motivo,
            hora: merma.hora,
            created_at: new Date().toISOString()
          })
        });
      } catch (err) {
        console.warn("Error al insertar merma en Supabase:", err);
      }
    }

    return merma;
  }

  // --- MÉTODOS AUXILIARES LOCALES ---

  getLocalInsumos() {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.storageKeyInsumos);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch (e) {}

    if (this._inMemoryInsumos && Array.isArray(this._inMemoryInsumos) && this._inMemoryInsumos.length > 0) {
      return this._inMemoryInsumos;
    }

    this._inMemoryInsumos = JSON.parse(JSON.stringify(INSUMOS_DATA));
    return this._inMemoryInsumos;
  }

  cacheLocalInsumos(list) {
    this._inMemoryInsumos = list;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKeyInsumos, JSON.stringify(list));
      }
    } catch (e) {}
  }

  getLocalMermas() {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.storageKeyMermas);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch (e) {}

    if (this._inMemoryMermas && Array.isArray(this._inMemoryMermas)) {
      return this._inMemoryMermas;
    }

    this._inMemoryMermas = JSON.parse(JSON.stringify(INITIAL_MERMAS));
    return this._inMemoryMermas;
  }

  cacheLocalMermas(list) {
    this._inMemoryMermas = list;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKeyMermas, JSON.stringify(list));
      }
    } catch (e) {}
  }

  resetToDefaults() {
    const defaultInsumos = JSON.parse(JSON.stringify(INSUMOS_DATA));
    const defaultMermas = JSON.parse(JSON.stringify(INITIAL_MERMAS));
    this.cacheLocalInsumos(defaultInsumos);
    this.cacheLocalMermas(defaultMermas);
    return { insumos: defaultInsumos, mermas: defaultMermas };
  }

  // --- MAPEOS DE SCHEMA ---

  sqlToInsumo(row) {
    return {
      id: row.id,
      nombre: row.nombre,
      emoji: row.emoji || '🍣',
      unidad: row.unidad || 'g',
      stockInicial: parseFloat(row.stock_inicial || 0),
      consumoTeorico: parseFloat(row.consumo_teorico || 0),
      consumoReal: parseFloat(row.consumo_real || 0),
      stockMinimo: parseFloat(row.stock_minimo || 0),
      precio: parseFloat(row.precio || 0)
    };
  }

  insumoToSql(ins) {
    return {
      id: ins.id,
      nombre: ins.nombre,
      emoji: ins.emoji || '🍣',
      unidad: ins.unidad || 'g',
      stock_inicial: ins.stockInicial,
      consumo_teorico: ins.consumoTeorico,
      consumo_real: ins.consumoReal,
      stock_minimo: ins.stockMinimo,
      precio: ins.precio,
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Genera el script SQL para inicializar Supabase
   */
  getSQLSchema() {
    return `-- ==========================================================================
-- ECOSISTEMA SUSHI ERIZO - ESQUEMA DE BASE DE DATOS SUPABASE (PostgreSQL)
-- Copia y pega este script en el SQL Editor de tu proyecto de Supabase
-- ==========================================================================

-- 1. Tabla de Insumos de Barra
CREATE TABLE IF NOT EXISTS public.insumos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  emoji TEXT DEFAULT '🍣',
  unidad TEXT NOT NULL DEFAULT 'g',
  stock_inicial NUMERIC NOT NULL DEFAULT 0,
  consumo_teorico NUMERIC NOT NULL DEFAULT 0,
  consumo_real NUMERIC NOT NULL DEFAULT 0,
  stock_minimo NUMERIC NOT NULL DEFAULT 0,
  precio NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Bitácora de Mermas
CREATE TABLE IF NOT EXISTS public.mermas (
  id TEXT PRIMARY KEY,
  insumo_id TEXT REFERENCES public.insumos(id) ON DELETE CASCADE,
  cantidad NUMERIC NOT NULL,
  motivo TEXT NOT NULL,
  hora TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Habilitar Seguridad por Fila (Row Level Security)
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mermas ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Acceso para la API Anónima (Anon Public Key)
DROP POLICY IF EXISTS "Permitir lectura publica insumos" ON public.insumos;
CREATE POLICY "Permitir lectura publica insumos" ON public.insumos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir escritura publica insumos" ON public.insumos;
CREATE POLICY "Permitir escritura publica insumos" ON public.insumos FOR ALL USING (true);

DROP POLICY IF EXISTS "Permitir lectura publica mermas" ON public.mermas;
CREATE POLICY "Permitir lectura publica mermas" ON public.mermas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir escritura publica mermas" ON public.mermas;
CREATE POLICY "Permitir escritura publica mermas" ON public.mermas FOR ALL USING (true);

-- 5. Carga de Datos Iniciales de Barra de Sushi
INSERT INTO public.insumos (id, nombre, emoji, unidad, stock_inicial, consumo_teorico, consumo_real, stock_minimo, precio)
VALUES 
  ('salmon', 'Salmón Fresco Premium', '🍣', 'g', 5000, 2400, 2900, 500, 28),
  ('arroz', 'Arroz Sumeshi Japonés', '🍚', 'g', 8000, 3600, 3800, 800, 4),
  ('aguacate', 'Aguacate Hass', '🥑', 'ud', 20, 12, 15, 4, 25),
  ('nori', 'Alga Nori Tostada', '🍙', 'hojas', 48, 22, 24, 50, 15),
  ('quesoCrema', 'Queso Crema Philadelphia', '🧀', 'g', 3000, 1200, 1380, 400, 12),
  ('atun', 'Atún Aleta Amarilla', '🐟', 'g', 2000, 900, 960, 300, 32),
  ('pepino', 'Pepino Fresco', '🥒', 'g', 2500, 800, 850, 300, 3)
ON CONFLICT (id) DO UPDATE SET
  stock_inicial = EXCLUDED.stock_inicial,
  stock_minimo = EXCLUDED.stock_minimo,
  precio = EXCLUDED.precio;
`;
  }
}
