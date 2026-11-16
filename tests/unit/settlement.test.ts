import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/contratos/[id]/fianza/liquidacion/actions", () => ({
  confirmSettlement: vi.fn(),
  deleteSettlementItem: vi.fn(),
  openSettlement: vi.fn(),
  reopenSettlement: vi.fn(),
  respondSettlement: vi.fn(),
  saveSettlementItem: vi.fn(),
  sendSettlement: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AddItemForm, ConfirmSettlementButton, RespondForm } from "@/components/contracts/settlement-actions";
import { ElementCompare } from "@/components/contracts/settlement-element";
import type { InventoryItemView } from "@/lib/contracts/inventory-queries";
import {
  SETTLEMENT_NOTICE,
  WEAR_NOTICE,
  answeredTotals,
  classifyExit,
  entryMatch,
  parseAmount,
  settlementAnswersSchema,
  settlementItemSchema,
  settlementStatusLabel,
  settlementTotals,
} from "@/lib/contracts/settlement";

const item = (id: string, area: string, name: string, condition: "new" | "good" | "worn" | "damaged") => ({ id, area, name, condition });

describe("comparación entrada/salida para la liquidación", () => {
  const entry = [item("e1", "Cocina", "Nevera", "good"), item("e2", "Habitación", "Colchón", "new"), item("e3", "Baño", "Espejo", "damaged"), item("e4", "Salón", "Sofá", "good")];
  const exit = [
    item("x1", "Cocina", "Nevera", "damaged"), // daño nuevo
    item("x2", "Habitación", "Colchón", "worn"), // desgaste
    item("x3", "Baño", "Espejo", "damaged"), // ya estaba dañado
    item("x4", "Salón", "Sofá", "good"),
    item("x5", "Terraza", "Mesa", "damaged"), // sin equivalente
  ];

  it("solo los daños nuevos son descontables; el desgaste se avisa aparte", () => {
    const r = classifyExit(exit, entry);
    expect(r.newDamages.map((i) => i.id)).toEqual(["x1"]);
    expect(r.wear.map((i) => i.id)).toEqual(["x2"]);
    expect(r.unmatched.map((i) => i.id)).toEqual(["x3", "x5"]);
  });

  it("la zona y el nombre se comparan sin mayúsculas ni espacios sobrantes", () => {
    expect(entryMatch(entry, { area: " cocina ", name: "NEVERA" })?.id).toBe("e1");
    expect(entryMatch(entry, { area: "Cocina", name: "Horno" })).toBeNull();
  });
});

describe("totales", () => {
  it("suma en céntimos y avisa si los descuentos superan la fianza", () => {
    expect(settlementTotals([{ amount: 0.1 }, { amount: 0.2 }], 320)).toMatchObject({ total: 0.3, remaining: 319.7, exceeds: false });
    expect(settlementTotals([{ amount: 200 }, { amount: 150.5 }], 320)).toMatchObject({ total: 350.5, remaining: 0, exceeds: true });
    expect(settlementTotals([], 320)).toMatchObject({ total: 0, remaining: 320, exceeds: false });
  });

  it("separa lo aceptado de lo no aceptado", () => {
    const base = { id: "i", sort_order: 1, inventory_item_id: null, tenant_comment: null, responded_at: null };
    const items = [
      { ...base, concept: "a", amount: 100, tenant_response: "accepted" as const },
      { ...base, concept: "b", amount: 50.5, tenant_response: "rejected" as const },
    ];
    expect(answeredTotals(items)).toEqual({ accepted: 100, rejected: 50.5 });
  });

  it("estados con su etiqueta", () => {
    expect(settlementStatusLabel({ status: "draft", locked_at: null })).toBe("En preparación");
    expect(settlementStatusLabel({ status: "sent", locked_at: null })).toBe("Enviada");
    expect(settlementStatusLabel({ status: "agreed", locked_at: null })).toBe("De acuerdo");
    expect(settlementStatusLabel({ status: "disputed", locked_at: "2027-01-01T00:00:00Z" })).toBe("Con discrepancias · cerrada");
  });
});

describe("formularios", () => {
  it("importes con coma, con miles o con punto; sin negativos ni letras", () => {
    expect(parseAmount("120")).toBe(120);
    expect(parseAmount("120,5")).toBe(120.5);
    expect(parseAmount("1.234,50")).toBe(1234.5);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("-5")).toBeNaN();
    expect(parseAmount("mucho")).toBeNaN();
    expect(parseAmount("")).toBeNaN();
  });

  it("la partida pide concepto e importe mayor que cero", () => {
    const ok = settlementItemSchema.safeParse({ concept: " Nevera ", amount: "120,50", inventory_item_id: null });
    expect(ok.success && ok.data).toMatchObject({ concept: "Nevera", amount: 120.5, inventory_item_id: null });
    expect(settlementItemSchema.safeParse({ concept: "", amount: "10" }).success).toBe(false);
    expect(settlementItemSchema.safeParse({ concept: "x", amount: "0" }).success).toBe(false);
  });

  it("no aceptar exige comentario", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(settlementAnswersSchema.safeParse([{ item_id: id, response: "accepted" }]).success).toBe(true);
    expect(settlementAnswersSchema.safeParse([{ item_id: id, response: "rejected", comment: "" }]).success).toBe(false);
    expect(settlementAnswersSchema.safeParse([{ item_id: id, response: "rejected", comment: "Ya estaba así" }]).success).toBe(true);
    expect(settlementAnswersSchema.safeParse([{ item_id: id, response: "quizá" }]).success).toBe(false);
  });
});

describe("pantalla de la liquidación", () => {
  const view = (condition: InventoryItemView["condition"]): InventoryItemView => ({
    id: "i", area: "Cocina", name: "Nevera", condition, notes: "Puerta rota", created_by: null, created_at: "2027-01-01T00:00:00Z",
    photos: [{ path: "p", url: "https://example.test/foto.webp" }],
  });

  it("el elemento muestra estado y fotos de la entrada y de la salida", () => {
    const html = renderToStaticMarkup(createElement(ElementCompare, { entry: view("good"), exit: view("damaged") }));
    expect(html).toContain("Entrada · Buen estado");
    expect(html).toContain("Salida · Dañado o roto");
    expect(html.match(/example\.test\/foto\.webp/g)).toHaveLength(2);
  });

  it("los textos dicen que Convivo solo documenta y avisan del desgaste", () => {
    expect(SETTLEMENT_NOTICE).toMatch(/no media[\s\S]*no propone cifras[\s\S]*no decide[\s\S]*no mueve dinero/);
    expect(SETTLEMENT_NOTICE).toContain("borrador pendiente de revisión legal");
    expect(WEAR_NOTICE).toContain("no se descuenta");
  });

  it("el casero ve la lista de daños nuevos como único vínculo; el inquilino responde a cada partida", () => {
    const add = renderToStaticMarkup(createElement(AddItemForm, { settlementId: "s", candidates: [{ id: "x1", label: "Cocina · Nevera" }] }));
    expect(add).toContain("Cocina · Nevera");
    expect(add).toContain("solo daños nuevos");
    expect(add).toContain("Convivo no propone cifras");

    const respond = renderToStaticMarkup(
      createElement(RespondForm, {
        contractId: "c",
        settlementId: "s",
        items: [{ id: "a", concept: "Nevera", amountLabel: "120 €", response: null, comment: null }],
      }),
    );
    expect(respond).toContain("Acepto");
    expect(respond).toContain("No acepto");
    expect(respond).toContain("Responde a todas las partidas");
  });

  it("al confirmar se avisa de que no es aceptar lo rechazado", () => {
    const html = renderToStaticMarkup(createElement(ConfirmSettlementButton, { contractId: "c", settlementId: "s", disputed: true }));
    expect(html).toContain("No significa aceptar las partidas que se hayan rechazado");
  });
});
