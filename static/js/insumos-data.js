/**
 * Gestión de Inventario, Insumos y Control de Merma
 * Estilo Sushi Order Management System
 */

export const INSUMOS_DATA = [
  {
    id: "salmon",
    nombre: "Salmón Fresco Premium",
    emoji: "🍣",
    unidad: "g",
    stockInicial: 5000,
    consumoTeorico: 2400,
    consumoReal: 2900,
    stockMinimo: 500,
    precio: 28 // MXN/g equivalencia
  },
  {
    id: "arroz",
    nombre: "Arroz Sumeshi Japonés",
    emoji: "🍚",
    unidad: "g",
    stockInicial: 8000,
    consumoTeorico: 3600,
    consumoReal: 3800,
    stockMinimo: 800,
    precio: 4
  },
  {
    id: "aguacate",
    nombre: "Aguacate Hass",
    emoji: "🥑",
    unidad: "ud",
    stockInicial: 20,
    consumoTeorico: 12,
    consumoReal: 15,
    stockMinimo: 4,
    precio: 25
  },
  {
    id: "nori",
    nombre: "Alga Nori Tostada",
    emoji: "🍙",
    unidad: "hojas",
    stockInicial: 48,
    consumoTeorico: 22,
    consumoReal: 24,
    stockMinimo: 50,
    precio: 15
  },
  {
    id: "quesoCrema",
    nombre: "Queso Crema Philadelphia",
    emoji: "🧀",
    unidad: "g",
    stockInicial: 3000,
    consumoTeorico: 1200,
    consumoReal: 1380,
    stockMinimo: 400,
    precio: 12
  },
  {
    id: "atun",
    nombre: "Atún Aleta Amarilla",
    emoji: "🐟",
    unidad: "g",
    stockInicial: 2000,
    consumoTeorico: 900,
    consumoReal: 960,
    stockMinimo: 300,
    precio: 32
  },
  {
    id: "pepino",
    nombre: "Pepino Fresco",
    emoji: "🥒",
    unidad: "g",
    stockInicial: 2500,
    consumoTeorico: 800,
    consumoReal: 850,
    stockMinimo: 300,
    precio: 3
  }
];

export const INITIAL_MERMAS = [
  {
    id: "m1",
    insumoId: "salmon",
    cantidad: 150,
    motivo: "Sobrante de cortes y piel",
    hora: "10:32"
  },
  {
    id: "m2",
    insumoId: "aguacate",
    cantidad: 2,
    motivo: "Maduración no óptima",
    hora: "09:15"
  }
];

export const PROYECCION_FALTANTE = [
  { insumoId: "nori", cantidad: 6, unidad: "hojas", falta: true },
  { insumoId: "quesoCrema", cantidad: 150, unidad: "g", falta: true },
  { insumoId: "arroz", cantidad: 0, unidad: "g", falta: false },
  { insumoId: "salmon", cantidad: 600, unidad: "g", falta: true }
];

export function calcMerma(ins) {
  return Math.max(0, ins.consumoReal - ins.consumoTeorico);
}

export function calcMermaPct(ins) {
  if (!ins.consumoTeorico) return 0;
  return ((calcMerma(ins) / ins.consumoTeorico) * 100);
}

export function stockStatus(ins) {
  const restante = ins.stockInicial - ins.consumoReal;
  if (restante <= ins.stockMinimo * 0.6) return "critico";
  if (restante <= ins.stockMinimo) return "alerta";
  return "ok";
}

export function mermaPctStatus(pct) {
  if (pct >= 15) return "critico";
  if (pct >= 8) return "alerta";
  return "ok";
}
