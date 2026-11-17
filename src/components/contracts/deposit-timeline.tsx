import { eventDetails, eventLabel } from "@/lib/contracts/deposit-tracking";

type TimelineEvent = { id: number | string; kind: string; data: unknown; created_at: string };

/**
 * Cronología de la fianza y de su liquidación: cuándo, qué pasó y, cuando el
 * evento lo guarda, el detalle (fecha e importe de cada devolución marcada, o
 * las respuestas que había antes de reabrir la liquidación).
 */
export function DepositTimeline({ events, when, className }: { events: TimelineEvent[]; when: (iso: string) => string; className?: string }) {
  return (
    <ul className={className ?? "mt-3 space-y-1"}>
      {events.map((e) => {
        const details = eventDetails(e.kind, e.data);
        return (
          <li key={e.id}>
            <span className="text-muted">{when(e.created_at)}</span> · {eventLabel(e.kind, e.data)}
            {details.length > 0 ? (
              <>
                <span className="text-muted"> Lo que había antes de reabrirla:</span>
                <ul className="mt-1 ml-5 list-disc space-y-0.5 text-muted">
                  {details.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
