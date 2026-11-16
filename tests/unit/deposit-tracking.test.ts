import { describe, expect, it } from "vitest";

import {
  EMPTY_DEPOSIT,
  canDownloadEvidence,
  clockSentence,
  daysBetween,
  depositClock,
  isReceiptPath,
  addOneMonth,
  eventLabel,
  returnSchema,
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
  });
});

describe("reloj del plazo de devolución", () => {
  it("no empieza hasta confirmar las llaves", () => {
    expect(depositClock(EMPTY_DEPOSIT, "2027-07-10").state).toBe("not_started");
  });

  it("fecha declarada y sin confirmar: no hay reloj oficial; pasado un mes se puede descargar el paquete", () => {
    const declared = { ...EMPTY_DEPOSIT, keys_declared_on: "2027-06-30", keys_declared_at: "2027-07-01T10:00:00Z" };
    expect(depositClock(declared, "2027-07-10")).toMatchObject({ state: "unconfirmed", dueOn: "2027-07-30", daysLeft: 20 });
    expect(depositClock(declared, "2027-07-30")).toMatchObject({ state: "unconfirmed", daysLeft: 0 });
    expect(depositClock(declared, "2027-07-31")).toMatchObject({ state: "unconfirmed_overdue", daysLate: 1 });
    expect(canDownloadEvidence(declared, "2027-07-30")).toBe(false);
    expect(canDownloadEvidence(declared, "2027-07-31")).toBe(true);
    expect(canDownloadEvidence({ ...declared, status: "returned" }, "2027-09-01")).toBe(false);
    expect(clockSentence(depositClock(declared, "2027-07-10"))).toContain("no ha confirmado");
  });

  it("un mes se suma como Postgres (31 de enero + 1 mes = 28 de febrero)", () => {
    expect(addOneMonth("2027-01-31")).toBe("2027-02-28");
    expect(addOneMonth("2028-01-31")).toBe("2028-02-29");
    expect(addOneMonth("2027-12-15")).toBe("2028-01-15");
    expect(addOneMonth("2027-06-30")).toBe("2027-07-30");
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
    const kinds = ["keys_declared", "keys_confirmed", "keys_reminder", "keys_unconfirmed_due", "settlement_sent", "settlement_answered", "settlement_reopened", "settlement_to_confirm", "settlement_locked", "return_closing", "return_overdue", "return_marked", "return_confirmed", "return_disputed"] as const;
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
    // Ningún email dice que Hommie da la fecha por confirmada.
    for (const kind of kinds) for (const party of ["landlord", "tenant"] as const) {
      expect(depositEmail({ ...base, kind, party }).text).not.toMatch(/se dará por confirmada|se da por confirmada|7 días/);
    }
    expect(depositEmail({ ...base, kind: "keys_reminder", party: "landlord" }).text).toContain("sin confirmar");
    expect(depositEmail({ ...base, kind: "keys_unconfirmed_due" }).text).toContain("no la ha confirmado");
  });
});

describe("cronología e importe devuelto", () => {
  it("las etiquetas de la cronología no dicen nunca que Hommie da la fecha por confirmada", () => {
    for (const kind of ["keys_declared", "keys_confirmed", "keys_reminder", "keys_unconfirmed_due"]) {
      expect(eventLabel(kind)).not.toMatch(/dio por confirmada|da por confirmada|7 días/);
    }
    expect(eventLabel("keys_declared")).toContain("sin confirmar por el casero");
    expect(eventLabel("settlement_confirmed", { party: "tenant" })).toBe("El inquilino confirmó la liquidación");
    expect(eventLabel("settlement_answered", { accepted: 1, rejected: 2 })).toContain("no acepta 2");
  });

  it("el importe devuelto es opcional, admite coma y no admite negativos ni letras", () => {
    const ok = (amount: string) => returnSchema.safeParse({ date: "2020-01-01", amount });
    expect(ok("").data?.amount).toBeNull();
    expect(ok("250").data?.amount).toBe(250);
    expect(ok("250,5").data?.amount).toBe(250.5);
    expect(ok("-5").success).toBe(false);
    expect(ok("mucho").success).toBe(false);
    expect(returnSchema.safeParse({ date: "2999-01-01", amount: "" }).success).toBe(false);
  });
});
