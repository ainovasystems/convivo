import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Las acciones del servidor no se ejecutan en estas pruebas.
vi.mock("@/app/contratos/[id]/fianza/actions", () => ({
  recordDeposit: vi.fn(),
  declareKeys: vi.fn(),
  confirmKeys: vi.fn(),
  markReturned: vi.fn(),
  respondReturn: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { DepositSection } from "@/components/contracts/deposit-section";
import type { DepositView } from "@/lib/contracts/deposit-queries";
import { EMPTY_DEPOSIT, madridToday, type DepositRow } from "@/lib/contracts/deposit-tracking";

const day = (n: number) => madridToday(new Date(Date.now() + n * 86_400_000));
const view = (row: Partial<DepositRow> = {}, extra: Partial<DepositView> = {}): DepositView => ({
  row: { ...EMPTY_DEPOSIT, ...row },
  tracked: true,
  events: [],
  receiptUrl: null,
  canDeclareKeys: true,
  ...extra,
});
const render = (v: DepositView, o: { landlord: boolean; room?: boolean; galicia?: boolean; deposit?: number }) =>
  renderToStaticMarkup(
    createElement(DepositSection, {
      contractId: "11111111-1111-4111-8111-111111111111",
      deposit: o.deposit ?? 320,
      view: v,
      isLandlord: o.landlord,
      roomKind: o.room ?? true,
      isGalicia: o.galicia ?? true,
      otherName: "Bruno",
    }),
  );

describe("apartado «Fianza»", () => {
  it("sin fianza no hay seguimiento", () => {
    const html = render(view(), { landlord: true, deposit: 0 });
    expect(html).toContain("no tiene fianza");
    expect(html).not.toContain("Anotar el depósito");
  });

  it("el casero anota el depósito (habitaciones: «si tu comunidad lo exige», sin afirmar plazo ni obligación) y el inquilino solo espera", () => {
    const landlord = render(view(), { landlord: true });
    expect(landlord).toContain("Pendiente de depositar");
    expect(landlord).toContain("Anotar el depósito");
    expect(landlord).toContain("Si tu comunidad lo exige");
    expect(landlord).toContain("IGVS");
    expect(landlord).toContain("no hemos confirmado que la obligación");
    expect(landlord).not.toMatch(/en el plazo de un mes para depositar|plazo para depositar/);
    expect(landlord).toContain("Convivo no cobra");
    expect(landlord).toContain("pendiente de revisión legal");

    const tenant = render(view(), { landlord: false });
    expect(tenant).not.toContain("Anotar el depósito");
  });

  it("las dos partes ven estado, fecha y número; solo el casero ve el enlace al resguardo", () => {
    const row = { status: "deposited" as const, deposited_on: "2027-01-15", receipt_number: "RES-77", has_receipt: true, deposit_recorded_at: "2027-01-15T10:00:00Z" };
    const v = view(row, { receiptUrl: "https://example.test/firmado" });
    const landlord = render(v, { landlord: true });
    const tenant = render(v, { landlord: false });
    for (const html of [landlord, tenant]) {
      expect(html).toContain("RES-77");
      expect(html).toContain("15 de enero de 2027");
      expect(html).toContain("Depositada");
    }
    expect(landlord).toContain("Ver mi resguardo");
    expect(tenant).not.toContain("example.test/firmado");
    expect(tenant).not.toContain("Ver mi resguardo");
  });

  it("el inquilino declara las llaves solo con la estancia terminada; el casero las confirma", () => {
    expect(render(view({}, { canDeclareKeys: false }), { landlord: false })).toContain("cuando la estancia haya terminado");
    expect(render(view(), { landlord: false })).toContain("Declarar la entrega de llaves");
    const declared = { keys_declared_on: day(-2), keys_declared_at: new Date().toISOString() };
    const landlord = render(view(declared), { landlord: true });
    expect(landlord).toContain("Confirmar la entrega de llaves");
    expect(landlord).toContain("se dará por confirmada");
    expect(render(view(declared), { landlord: false })).not.toContain("Confirmar la entrega de llaves");
  });

  it("con las llaves confirmadas corre el reloj visible para las dos partes", () => {
    const row = {
      keys_declared_on: day(-25),
      keys_declared_at: new Date().toISOString(),
      keys_confirmed_at: new Date().toISOString(),
      keys_confirmation: "auto" as const,
      return_due_on: day(5),
    };
    for (const landlord of [true, false]) {
      const html = render(view(row), { landlord });
      expect(html).toContain("Quedan 5 días");
      expect(html).toContain("art. 36.4 LAU");
      expect(html).toContain("Dada por confirmada");
      expect(html).not.toContain("Preparar el paquete de pruebas");
    }
  });

  it("vencido y sin devolver: el paquete de pruebas es solo del inquilino", () => {
    const row = {
      keys_declared_on: day(-60),
      keys_declared_at: day(-60) + "T10:00:00Z",
      keys_confirmed_at: day(-55) + "T10:00:00Z",
      keys_confirmation: "landlord" as const,
      return_due_on: day(-3),
    };
    const tenant = render(view(row), { landlord: false });
    expect(tenant).toContain("Preparar el paquete de pruebas");
    expect(tenant).toContain("no hace");
    expect(tenant).toContain("hace 3 días");
    expect(render(view(row), { landlord: true })).not.toContain("Preparar el paquete de pruebas");
    expect(render(view(row), { landlord: true })).toContain("Marcar como devuelta");
  });

  it("devolución marcada: el inquilino confirma o dice que no; devuelta queda cerrada", () => {
    const base = {
      keys_declared_on: day(-20),
      keys_declared_at: day(-20) + "T10:00:00Z",
      keys_confirmed_at: day(-15) + "T10:00:00Z",
      keys_confirmation: "landlord" as const,
      return_due_on: day(10),
      return_marked_on: day(-1),
      return_marked_at: new Date().toISOString(),
    };
    const tenant = render(view(base), { landlord: false });
    expect(tenant).toContain("He recibido la fianza");
    expect(tenant).toContain("No la he recibido");
    expect(render(view(base), { landlord: true })).not.toContain("He recibido la fianza");

    const done = render(view({ ...base, status: "returned", return_response: "confirmed", return_response_at: new Date().toISOString() }), { landlord: false });
    expect(done).toContain("Devuelta");
    expect(done).toContain("ya no se puede cambiar");
    expect(done).not.toContain("He recibido la fianza");
  });
});
