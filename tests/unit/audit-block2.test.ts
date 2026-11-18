import { describe, expect, it } from "vitest";

import { RECEIPT_MAX_BYTES } from "@/lib/contracts/deposit-tracking";
import { RECEIPT_ERRORS, receiptPlan } from "@/lib/contracts/receipt-upload";
import { lastPage, PAGE_SIZE } from "@/lib/listings/filters";
import { salvageDraft } from "@/lib/listings/schema";
import { groupNotifications } from "@/lib/notifications/group";
import { isProtectedPath } from "@/lib/supabase/middleware";

// Arreglos de la auditoría 2: que nadie se pierda ni vea «Algo se ha torcido».

describe("I8 · el asistente guarda lo válido aunque haya un número fuera de rango", () => {
  const base = { title: "Habitación exterior en el centro", description: "Luminosa y tranquila, a dos minutos de la Muralla.", city: "Lugo", monthlyRent: "300" };

  it("aparta solo el campo no válido y dice cuál es", () => {
    const r = salvageDraft({ ...base, monthlyRent: "-50", deposit: "999999999", bedrooms: "1.5" });
    expect(r).not.toBeNull();
    expect(r!.data).toMatchObject({ title: base.title, description: base.description, city: "Lugo", monthlyRent: null, deposit: null, bedrooms: null });
    expect(r!.dropped).toEqual({ monthlyRent: "Precio: mínimo 50", deposit: "Fianza: máximo 100000", bedrooms: "Habitaciones: sin decimales" });
  });

  it("un código postal a medias no borra el resto de la dirección", () => {
    const r = salvageDraft({ ...base, address: { addressLine: "Rúa Nova 1", floorDoor: "2º A", postalCode: "2700" } });
    expect(r!.data.address).toEqual({ addressLine: "Rúa Nova 1", floorDoor: "2º A", postalCode: "" });
    expect(r!.data.monthlyRent).toBe(300);
    expect(Object.keys(r!.dropped)).toEqual(["address.postalCode"]);
  });

  it("si todo vale, no aparta nada; y lo ilegible sigue sin guardarse", () => {
    expect(salvageDraft(base)).toMatchObject({ dropped: {}, data: { monthlyRent: 300 } });
    expect(salvageDraft("no es un anuncio")).toBeNull();
  });
});

describe("I2 · resguardo de la fianza", () => {
  it("las fotos se comprimen (pesen lo que pesen) y el PDF se envía si cabe", () => {
    expect(receiptPlan({ type: "image/jpeg", size: 7_700_000, name: "resguardo.jpg" })).toEqual({ action: "compress" });
    expect(receiptPlan({ type: "image/png", size: 200, name: "a.png" })).toEqual({ action: "compress" });
    expect(receiptPlan({ type: "application/pdf", size: RECEIPT_MAX_BYTES, name: "r.pdf" })).toEqual({ action: "send" });
  });

  it("un PDF demasiado grande o un fichero de otro tipo se dicen con claridad, sin enviar nada", () => {
    expect(receiptPlan({ type: "application/pdf", size: RECEIPT_MAX_BYTES + 1, name: "r.pdf" })).toEqual({ error: RECEIPT_ERRORS.pdfTooBig });
    expect(receiptPlan({ type: "", size: 9_000_000, name: "ESCANEO.PDF" })).toEqual({ error: RECEIPT_ERRORS.pdfTooBig });
    expect(receiptPlan({ type: "image/gif", size: 10, name: "a.gif" })).toEqual({ error: RECEIPT_ERRORS.type });
    expect(receiptPlan({ type: "text/plain", size: 10, name: "a.txt" })).toEqual({ error: RECEIPT_ERRORS.type });
    expect(RECEIPT_ERRORS.pdfTooBig).toContain("2,5 MB");
  });
});

describe("I4 · última página de la búsqueda", () => {
  it("nunca es menor que 1 y redondea hacia arriba", () => {
    expect(lastPage(0)).toBe(1);
    expect(lastPage(1)).toBe(1);
    expect(lastPage(PAGE_SIZE)).toBe(1);
    expect(lastPage(PAGE_SIZE + 1)).toBe(2);
    expect(lastPage(13)).toBe(2);
    expect(lastPage(PAGE_SIZE * 3)).toBe(3);
  });
});

describe("I1 · avisos", () => {
  it("se reparten en «te toca», novedades y anteriores", () => {
    const items = [
      { id: "firmar", pending: true, needs_action: true },
      { id: "firmado", pending: true, needs_action: false },
      { id: "viejo", pending: false, needs_action: false },
    ];
    const g = groupNotifications(items);
    expect(g.todo.map((n) => n.id)).toEqual(["firmar"]);
    expect(g.news.map((n) => n.id)).toEqual(["firmado"]);
    expect(g.past.map((n) => n.id)).toEqual(["viejo"]);
  });

  it("la pantalla de avisos pide sesión", () => {
    expect(isProtectedPath("/avisos")).toBe(true);
    expect(isProtectedPath("/avisos/11111111-1111-4111-8111-111111111111")).toBe(true);
  });
});
