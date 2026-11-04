import { as, createUser, sysInsert, type Db } from "./helpers";

export const CRITERIA = {
  tenant_to_listing: { cleanliness: 4, accuracy: 5, area: 4, condition: 4, value: 5 },
  tenant_to_landlord: { communication: 5, treatment: 5, compliance: 4, deposit: 5 },
  landlord_to_tenant: { payment_punctuality: 5, home_care: 4, coexistence: 5, communication: 4 },
  flatmate_to_flatmate: { coexistence: 5, cleanliness: 4, noise: 4, respect: 5 },
} as const;

export const BODY =
  "Convivencia muy buena durante toda la estancia, todo según lo acordado y con buena comunicación.";

export async function createActiveListing(db: Db, ownerId: string, kind: "room" | "flat" = "room") {
  return sysInsert<{ id: string }>(
    db,
    `insert into public.listings (owner_id, kind, status, title, description, city, province,
       monthly_rent, available_from, current_flatmates)
     values ($1, $2::public.listing_kind, 'active', 'Habitación luminosa en el centro',
       'Habitación exterior en piso reformado, cerca de todo y con buena convivencia.',
       'Lugo', 'Lugo', 320, current_date, case when $2::text = 'room' then 2 end)
     returning id`,
    [ownerId, kind],
  );
}

type StayWindow =
  /** La ventana se abrió hace N días (estancia terminada hace N días). */
  | { windowOpenedDaysAgo: number }
  /** Estancia activa que empezó hoy: la ventana aún no se ha abierto. */
  | { windowNotOpenYet: true };

/**
 * Mundo de prueba: host con un anuncio room, guest, un compañero confirmado,
 * un compañero sin confirmar y un extraño. La estancia se crea como sistema
 * para poder fijar las fechas a voluntad.
 */
export async function createWorld(db: Db, window: StayWindow = { windowOpenedDaysAgo: 3 }) {
  const host = await createUser(db, "Ana Host");
  const guest = await createUser(db, "Bruno Guest");
  const flatmate = await createUser(db, "Carla Compañera");
  const pendingFlatmate = await createUser(db, "Dani Pendiente");
  const stranger = await createUser(db, "Eva Extraña");
  const listing = await createActiveListing(db, host);

  const stay =
    "windowNotOpenYet" in window
      ? await sysInsert<{ id: string }>(
          db,
          `insert into public.stays (listing_id, host_id, guest_id, start_date, status,
             host_confirmed_at, guest_confirmed_at, activated_at)
           values ($1, $2, $3, current_date, 'active', now(), now(), now())
           returning id`,
          [listing.id, host, guest],
        )
      : await sysInsert<{ id: string }>(
          db,
          `insert into public.stays (listing_id, host_id, guest_id, start_date, end_date, status,
             host_confirmed_at, guest_confirmed_at, activated_at, ended_at)
           values ($1, $2, $3, current_date - 200, current_date - $4::int, 'ended',
             now() - interval '200 days', now() - interval '200 days', now() - interval '200 days', now())
           returning id`,
          [listing.id, host, guest, window.windowOpenedDaysAgo],
        );

  await db.query(
    `insert into public.stay_participants (stay_id, user_id, added_by, confirmed_at)
     values ($1, $2, $3, now()), ($1, $4, $3, null)`,
    [stay.id, flatmate, host, pendingFlatmate],
  );

  return { host, guest, flatmate, pendingFlatmate, stranger, listing: listing.id, stay: stay.id };
}

type ReviewInput = {
  stay: string;
  author: string;
  subjectUser?: string;
  subjectListing?: string;
  criteria: Record<string, number>;
  rating?: number;
  body?: string;
};

/** Inserta una reseña como el usuario `author` (vía RLS). */
export function writeReview(db: Db, input: ReviewInput, actor: string = input.author) {
  return as(db, actor, async (tx) => {
    const { rows } = await tx.query<{ id: string; published_at: Date; relationship: string }>(
      `insert into public.reviews (stay_id, author_id, subject_type, subject_user_id, subject_listing_id,
         rating, criteria, body)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, published_at, relationship`,
      [
        input.stay,
        input.author,
        input.subjectListing ? "listing" : "user",
        input.subjectUser ?? null,
        input.subjectListing ?? null,
        input.rating ?? 5,
        JSON.stringify(input.criteria),
        input.body ?? BODY,
      ],
    );
    return rows[0];
  });
}

/** IDs de reseñas visibles para `viewer` (null = anónimo). */
export async function visibleReviewIds(db: Db, viewer: string | null, stay: string) {
  return as(db, viewer, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "select id from public.reviews where stay_id = $1 order by created_at",
      [stay],
    );
    return rows.map((r) => r.id);
  });
}
