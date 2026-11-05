import { describe, expect, it } from "vitest";

import { participantSchema, proposeStaySchema } from "@/lib/conversations/schema";
import { canTransitionInterest, interestActions, stayActions } from "@/lib/conversations/state";

const HOST = "h";
const GUEST = "g";
const stay = (over: Partial<Parameters<typeof stayActions>[0]> = {}) => ({
  status: "proposed" as const,
  host_id: HOST,
  guest_id: GUEST,
  host_confirmed_at: null,
  guest_confirmed_at: "2026-11-01T00:00:00Z",
  ...over,
});

describe("máquina de estados de interest (espejo de la BD)", () => {
  it.each([
    ["pending", "accepted", "owner", true],
    ["pending", "declined", "owner", true],
    ["pending", "withdrawn", "guest", true],
    ["accepted", "withdrawn", "guest", true],
    ["pending", "accepted", "guest", false],
    ["pending", "withdrawn", "owner", false],
    ["declined", "accepted", "owner", false],
    ["withdrawn", "pending", "guest", false],
    ["accepted", "declined", "owner", false],
  ] as const)("%s → %s por %s: %s", (from, to, role, ok) => {
    expect(canTransitionInterest(from, to, role)).toBe(ok);
  });

  it("acciones disponibles por estado y rol", () => {
    expect(interestActions("pending", "owner")).toEqual(["accept", "decline", "message"]);
    expect(interestActions("pending", "guest")).toEqual(["withdraw", "message"]);
    expect(interestActions("accepted", "owner")).toEqual(["message", "propose_stay"]);
    expect(interestActions("accepted", "guest")).toEqual(["withdraw", "message", "propose_stay"]);
    expect(interestActions("declined", "guest")).toEqual([]);
  });
});

describe("máquina de estados de stay (espejo de la BD)", () => {
  it("propuesta: confirma quien falta; cancelan ambos", () => {
    expect(stayActions(stay(), HOST, "flat")).toEqual(["confirm", "cancel"]);
    expect(stayActions(stay(), GUEST, "flat")).toEqual(["cancel"]);
  });
  it("activa: terminar; compañeros solo en habitaciones", () => {
    expect(stayActions(stay({ status: "active" }), GUEST, "flat")).toEqual(["end"]);
    expect(stayActions(stay({ status: "active" }), HOST, "room")).toEqual(["end", "add_participant"]);
  });
  it("terminada/cancelada o ajeno: nada", () => {
    expect(stayActions(stay({ status: "ended" }), HOST, "room")).toEqual([]);
    expect(stayActions(stay({ status: "cancelled" }), GUEST, "room")).toEqual([]);
    expect(stayActions(stay(), "otro", "room")).toEqual([]);
  });
});

describe("esquemas", () => {
  const id = "3f2b2c1a-1111-4222-8333-444455556666";
  it("la fecha de fin no puede ser anterior a la de inicio", () => {
    expect(proposeStaySchema.safeParse({ interestId: id, startDate: "2026-12-01", endDate: "2026-11-01" }).success).toBe(false);
    expect(proposeStaySchema.safeParse({ interestId: id, startDate: "2026-12-01", endDate: "" }).success).toBe(true);
  });
  it("el compañero se indica con el enlace a su perfil o su id", () => {
    expect(participantSchema.parse({ stayId: id, profile: `https://convivo.es/perfil/${id.toUpperCase()}` }).profile).toBe(id);
    expect(participantSchema.safeParse({ stayId: id, profile: "Carla" }).success).toBe(false);
  });
});
