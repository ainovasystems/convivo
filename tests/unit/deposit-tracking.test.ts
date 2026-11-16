import { describe, expect, it } from "vitest";

import {
  EMPTY_DEPOSIT,
  canDownloadEvidence,
  clockSentence,
  daysBetween,
  depositClock,
  isReceiptPath,
  keysAutoConfirmDay,
  madridToday,
  recordDepositSchema,
  sniffReceiptType,
  type DepositRow,
} from "@/lib/contracts/deposit-tracking";

const confirmed = (over: Partial<DepositRow> = {}): DepositRow => ({
  ...EMPTY_DEPOSIT,
  status: "deposited",
  keys_declared_on: "2027-06-30",
  keys_declared_at: "2027-07-01T10:00:00Z",
  keys_confirmed_at: "2027-07-02T10:00:00Z",
  keys_confirmation: "landlord",
  return_due_on: "2027-07-30",
  ...over,
});

describe("fechas", () => {
  it("cuenta días naturales y usa la fecha de España", () => {
    expect(daysBetween("2027-07-01", "2027-07-30")).toBe(29);
    expect(daysBetween("2027-07-30", "2027-07-01")).toBe(-29);
    // 23:30 UTC del 30 de junio ya es 1 de julio en España (verano, UTC+2).
    expect(madridToday(new Date("2027-06-30T23:30:00Z"))).toBe("2027-07-01");
    expect(keysAutoConfirmDay("2027-07-01T10:00:00Z")).toBe("2027-07-08");
  });
});

describe("reloj del plazo de devolución", () => {
  it("no empieza hasta confirmar las llaves", () => {
    expect(depositClock(EMPTY_DEPOSIT, "2027-07-10").state).toBe("not_started");
    expect(depositClock({ ...EMPTY_DEPOSIT, keys_declared_on: "2027-06-30" }, "2027-07-10").state).toBe("not_started");
  });

  it("corre, avisa a 7 días, vence y se pasa", () => {
    expect(depositClock(confirmed(), "2027-07-10")).toMatchObject({ state: "running", daysLeft: 20 });
    expect(depositClock(confirmed(), "2027-07-23")).toMatchObject({ state: "closing", daysLeft: 7 });
    expect(depositClock(confirmed(), "2027-07-30")).toMatchObject({ state: "closing", daysLeft: 0 });
    expect(depositClock(confirmed(), "2027-07-31")).toMatchObject({ state: "overdue", daysLate: 1 });
  });

  it("devuelta o marcada a la espera del inquilino no corre; reclamada vuelve a correr", () => {
    expect(depositClock(confirmed({ status: "returned", return_response: "confirmed" }), "2027-09-01").state).toBe("done");
    const marked = confirmed({ return_marked_on: "2027-07-20", return_marked_at: "2027-07-20T09:00:00Z" });
    expect(depositClock(marked, "2027-09-01").state).toBe("awaiting_tenant");
    expect(depositClock({ ...marked, status: "claimed", return_response: "not_received" }, "2027-09-01").state).toBe("overdue");
  });

  it("el paquete de pruebas solo con el plazo vencido y sin devolver", () => {
    expect(canDownloadEvidence(confirmed(), "2027-07-30")).toBe(false);
    expect(canDownloadEvidence(confirmed(), "2027-07-31")).toBe(true);
    expect(canDownloadEvidence(confirmed({ status: "returned", return_response: "confirmed" }), "2027-09-01")).toBe(false);
    expect(canDownloadEvidence(EMPTY_DEPOSIT, "2027-09-01")).toBe(false);
  });

  it("frases claras", () => {
    expect(clockSentence({ state: "closing", daysLeft: 1, dueOn: "2027-07-30" })).toBe("Quedan 1 día (hasta el 30 de julio de 2027).");
    expect(clockSentence({ state: "closing", daysLeft: 0, dueOn: "2027-07-30" })).toContain("Vence hoy");
    expect(clockSentence({ state: "overdue", daysLate: 4, dueOn: "2027-07-30" })).toContain("hace 4 días");
  });
});

describe("resguardo y formularios", () => {
  it("detecta el tipo real por los primeros bytes", () => {
    const bytes = (s: string) => new TextEncoder().encode(s);
    expect(sniffReceiptType(bytes("%PDF-1.7 resto"))).toBe("pdf");
    expect(sniffReceiptType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffReceiptType(bytes("MZ ejecutable"))).toBeNull();
  });

  it("la ruta tiene que estar en la carpeta del contrato", () => {
    const c = "11111111-1111-4111-8111-111111111111";
    const f = "22222222-2222-4222-8222-222222222222";
    expect(isReceiptPath(`${c}/${f}.pdf`, c)).toBe(true);
    expect(isReceiptPath(`${f}/${f}.pdf`, c)).toBe(false);
    expect(isReceiptPath(`${c}/${f}.exe`, c)).toBe(false);
  });

  it("valida fecha no futura y número de resguardo", () => {
    expect(recordDepositSchema.safeParse({ deposited_on: "2020-01-01", receipt_number: "RES-1" }).success).toBe(true);
    expect(recordDepositSchema.safeParse({ deposited_on: "2999-01-01", receipt_number: "RES-1" }).success).toBe(false);
    expect(recordDepositSchema.safeParse({ deposited_on: "2020-01-01", receipt_number: "  " }).success).toBe(false);
  });
});

describe("emails de la fianza", () => {
  it("escapan el título y no afirman nada legal sin el aviso de orientativo", async () => {
    const { depositEmail } = await import("@/lib/email/templates");
    const base = { party: "tenant" as const, listingTitle: "<b>Piso</b> & co", url: "https://x.test/contratos/1", dueOn: "2027-07-30" };
    const kinds = ["keys_declared", "keys_confirmed", "keys_auto_confirmed", "return_closing", "return_overdue", "return_marked", "return_confirmed", "return_disputed"] as const;
    for (const kind of kinds) {
      const m = depositEmail({ ...base, kind });
      expect(m.html).not.toContain("<b>Piso</b>");
      expect(m.html).toContain("&lt;b&gt;Piso");
      expect(m.html).toContain("no mueve dinero");
      expect(m.text).toContain("https://x.test/contratos/1");
    }
    expect(depositEmail({ ...base, kind: "return_overdue" }).html).toContain("30 de julio de 2027");
    expect(depositEmail({ ...base, kind: "return_overdue" }).html).toContain("paquete de pruebas");
    expect(depositEmail({ ...base, kind: "return_overdue", party: "landlord" }).html).toContain("márcalo en el contrato");
  });
});
