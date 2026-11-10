import { z } from "zod";

/**
 * Inventario de entrada y de salida de un contrato firmado. Las reglas las
 * impone la BD (20261111000100_contract_inventories.sql); esto es el mismo
 * esquema para el formulario y el servidor, y los textos de la interfaz.
 */
export const INVENTORY_STAGES = ["entry", "exit"] as const;
export type InventoryStage = (typeof INVENTORY_STAGES)[number];

/** Segmento de la URL en español ↔ valor en la BD. */
export const STAGE_SLUGS: Record<InventoryStage, string> = { entry: "entrada", exit: "salida" };
export function stageFromSlug(slug: string): InventoryStage | null {
  return slug === "entrada" ? "entry" : slug === "salida" ? "exit" : null;
}
export const STAGE_LABELS: Record<InventoryStage, string> = {
  entry: "Inventario de entrada",
  exit: "Inventario de salida",
};

export const ITEM_CONDITIONS = ["new", "good", "worn", "damaged"] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];
export const CONDITION_LABELS: Record<ItemCondition, string> = {
  new: "Nuevo",
  good: "Buen estado",
  worn: "Desgaste por uso",
  damaged: "Dañado o roto",
};

/** Zonas que se proponen en el formulario (se puede escribir otra). */
export const AREA_SUGGESTIONS = ["Habitación", "Cocina", "Baño", "Salón", "Pasillo y entrada", "Terraza", "Toda la vivienda"] as const;

export const MAX_ITEM_PHOTOS = 6;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Ruta de una foto del inventario: {contract_id}/{inventory_id}/{uuid}.webp */
export function isInventoryPhotoPath(path: string, contractId: string, inventoryId: string) {
  return new RegExp(`^${contractId}/${inventoryId}/${UUID}\\.webp$`).test(path);
}

export const inventoryItemSchema = z.object({
  area: z.string().trim().min(1, { error: "Indica la zona (p. ej. Cocina)" }).max(60, { error: "Máximo 60 caracteres" }),
  name: z.string().trim().min(1, { error: "Indica el elemento (p. ej. Nevera)" }).max(80, { error: "Máximo 80 caracteres" }),
  condition: z.enum(ITEM_CONDITIONS, { error: "Elige el estado" }),
  notes: z.string().trim().max(500, { error: "Máximo 500 caracteres" }).default(""),
  photos: z.array(z.string()).max(MAX_ITEM_PHOTOS, { error: `Como mucho ${MAX_ITEM_PHOTOS} fotos por elemento` }).default([]),
});
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

/** Agrupa los elementos por zona, en el orden en que aparece cada zona. */
export function groupByArea<T extends { area: string }>(items: T[]): { area: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.area) ?? [];
    list.push(item);
    groups.set(item.area, list);
  }
  return [...groups].map(([area, list]) => ({ area, items: list }));
}

/**
 * Comparación entrada → salida para el mismo elemento (misma zona y nombre).
 * Solo se marca lo que entró sin daños y sale dañado: el desgaste por el uso
 * normal no se descuenta de la fianza.
 */
export function compareWithEntry(
  exitItems: { area: string; name: string; condition: ItemCondition }[],
  entryItems: { area: string; name: string; condition: ItemCondition }[],
) {
  const key = (i: { area: string; name: string }) => `${i.area.toLowerCase()}|${i.name.toLowerCase()}`;
  const entry = new Map(entryItems.map((i) => [key(i), i.condition]));
  return exitItems.map((i) => {
    const before = entry.get(key(i)) ?? null;
    return { ...i, before, newDamage: before !== null && before !== "damaged" && i.condition === "damaged" };
  });
}
