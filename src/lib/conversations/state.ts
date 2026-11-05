import type { Database } from "@/types/database.types";

export type InterestStatus = Database["public"]["Enums"]["interest_status"];
export type StayStatus = Database["public"]["Enums"]["stay_status"];
export type ConversationRole = "owner" | "guest";

/**
 * Espejo en TypeScript de la máquina de estados que impone la base de datos
 * (triggers y RPC). Solo decide qué botones enseñar: si la UI se equivocara,
 * la BD seguiría rechazando la transición.
 */
export const INTEREST_TRANSITIONS: Record<InterestStatus, Partial<Record<InterestStatus, ConversationRole>>> = {
  pending: { accepted: "owner", declined: "owner", withdrawn: "guest" },
  accepted: { withdrawn: "guest" },
  declined: {},
  withdrawn: {},
};

export function canTransitionInterest(from: InterestStatus, to: InterestStatus, role: ConversationRole) {
  return INTEREST_TRANSITIONS[from][to] === role;
}

export type InterestAction = "accept" | "decline" | "withdraw" | "message" | "propose_stay";

export function interestActions(status: InterestStatus, role: ConversationRole): InterestAction[] {
  const actions: InterestAction[] = [];
  if (canTransitionInterest(status, "accepted", role)) actions.push("accept");
  if (canTransitionInterest(status, "declined", role)) actions.push("decline");
  if (canTransitionInterest(status, "withdrawn", role)) actions.push("withdraw");
  if (status === "pending" || status === "accepted") actions.push("message");
  if (status === "accepted") actions.push("propose_stay");
  return actions;
}

export type StayLike = {
  status: StayStatus;
  host_id: string;
  guest_id: string;
  host_confirmed_at: string | null;
  guest_confirmed_at: string | null;
};

export type StayAction = "confirm" | "cancel" | "end" | "add_participant";

export function stayActions(stay: StayLike, userId: string, listingKind: "room" | "flat" | "seeking"): StayAction[] {
  const isHost = userId === stay.host_id;
  const isGuest = userId === stay.guest_id;
  if (!isHost && !isGuest) return [];
  const actions: StayAction[] = [];
  if (stay.status === "proposed") {
    const mine = isHost ? stay.host_confirmed_at : stay.guest_confirmed_at;
    if (!mine) actions.push("confirm");
    actions.push("cancel");
  }
  if (stay.status === "active") actions.push("end");
  if ((stay.status === "proposed" || stay.status === "active") && listingKind === "room") actions.push("add_participant");
  return actions;
}

export const INTEREST_STATUS_LABELS: Record<InterestStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  declined: "Rechazado",
  withdrawn: "Retirado",
};

export const STAY_STATUS_LABELS: Record<StayStatus, string> = {
  proposed: "Pendiente de confirmar",
  active: "Activa",
  ended: "Terminada",
  cancelled: "Cancelada",
};
