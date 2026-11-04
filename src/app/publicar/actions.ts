"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { LISTING_KINDS, type ListingKind, type ListingStatus } from "@/lib/listings/options";
import {
  type ListingDraft,
  listingDraftSchema,
  photoPathBelongsTo,
  photosSchema,
  publishErrors,
  toListingRow,
} from "@/lib/listings/schema";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/profile";

export type SaveResult = { ok: boolean; message?: string; errors?: Record<string, string>; savedAt?: string };

const idSchema = z.uuid();

async function requireOwnListing(id: string) {
  const user = await getCurrentUser();
  if (!user || !idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select("id, kind, status, photos, owner_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  return data ? { user, supabase, listing: data } : null;
}

const NOT_FOUND: SaveResult = { ok: false, message: "No encontramos ese anuncio o tu sesión ha caducado." };

/** Paso "tipo": crea el borrador y lleva al asistente. */
export async function createDraft(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/publicar");
  const kind = z.enum(LISTING_KINDS).safeParse(formData.get("kind"));
  if (!kind.success) redirect("/publicar");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .insert({ owner_id: user.id, kind: kind.data })
    .select("id")
    .single();
  if (error || !data) redirect("/publicar?error=1");
  redirect(`/publicar/${data.id}?paso=datos`);
}

async function persist(
  ctx: NonNullable<Awaited<ReturnType<typeof requireOwnListing>>>,
  draft: ListingDraft,
  status?: ListingStatus,
): Promise<SaveResult> {
  const { supabase, listing } = ctx;
  const row = toListingRow(listing.kind as ListingKind, draft);
  const { error } = await supabase
    .from("listings")
    .update(status ? { ...row, status } : row)
    .eq("id", listing.id);
  if (error) {
    return { ok: false, message: "No hemos podido guardar el anuncio. Revisa los datos e inténtalo de nuevo." };
  }

  const a = draft.address;
  if (listing.kind !== "seeking" && a.addressLine) {
    const { error: addrError } = await supabase.from("listing_addresses").upsert({
      listing_id: listing.id,
      address_line: a.addressLine,
      floor_door: a.floorDoor || null,
      postal_code: a.postalCode || null,
    });
    if (addrError) return { ok: false, errors: { "address.addressLine": "Dirección no válida" } };
  } else {
    await supabase.from("listing_addresses").delete().eq("listing_id", listing.id);
  }
  return { ok: true, savedAt: new Date().toISOString() };
}

/**
 * Guarda el anuncio. En borrador admite datos incompletos (autoguardado);
 * si ya está publicado/pausado exige lo mismo que para publicar.
 */
export async function saveListing(id: string, input: unknown): Promise<SaveResult> {
  const ctx = await requireOwnListing(id);
  if (!ctx) return NOT_FOUND;
  if (ctx.listing.status === "closed") return { ok: false, message: "Un anuncio cerrado no se puede editar." };

  const parsed = listingDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: "Revisa los campos marcados." };

  if (ctx.listing.status !== "draft") {
    const errors = publishErrors(ctx.listing.kind as ListingKind, parsed.data);
    if (Object.keys(errors).length) return { ok: false, errors, message: "Faltan datos obligatorios." };
  }

  const result = await persist(ctx, parsed.data);
  if (result.ok) {
    revalidatePath(`/anuncios/${id}`);
    revalidatePath("/mis-anuncios");
  }
  return result;
}

export async function publishListing(id: string, input: unknown): Promise<SaveResult> {
  const ctx = await requireOwnListing(id);
  if (!ctx) return NOT_FOUND;
  if (ctx.listing.status !== "draft") return { ok: false, message: "Este anuncio ya estaba publicado." };

  const parsed = listingDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), message: "Revisa los campos marcados." };
  const errors = publishErrors(ctx.listing.kind as ListingKind, parsed.data);
  if (Object.keys(errors).length) return { ok: false, errors, message: "Faltan datos para publicar." };

  const result = await persist(ctx, parsed.data, "active");
  if (!result.ok) return result;

  revalidatePath("/anuncios");
  revalidatePath("/mis-anuncios");
  redirect(`/anuncios/${id}?publicado=1`);
}

/** Guarda la lista ordenada de fotos y borra del Storage las que se quitaron. */
export async function updatePhotos(id: string, paths: unknown): Promise<SaveResult> {
  const ctx = await requireOwnListing(id);
  if (!ctx) return NOT_FOUND;
  const parsed = photosSchema.safeParse(paths);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };
  if (!parsed.data.every((p) => photoPathBelongsTo(p, ctx.user.id, id))) {
    return { ok: false, message: "Alguna foto no pertenece a este anuncio." };
  }
  if (new Set(parsed.data).size !== parsed.data.length) return { ok: false, message: "Fotos duplicadas." };

  const { error } = await ctx.supabase.from("listings").update({ photos: parsed.data }).eq("id", id);
  if (error) return { ok: false, message: "No hemos podido guardar las fotos." };

  const removed = ctx.listing.photos.filter((p) => !parsed.data.includes(p));
  if (removed.length) await ctx.supabase.storage.from("listing-photos").remove(removed);

  revalidatePath(`/anuncios/${id}`);
  return { ok: true, savedAt: new Date().toISOString() };
}

const TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: [],
  active: ["paused", "closed"],
  paused: ["active", "closed"],
  closed: [],
};

export async function setListingStatus(id: string, status: ListingStatus): Promise<SaveResult> {
  const ctx = await requireOwnListing(id);
  if (!ctx) return NOT_FOUND;
  if (!TRANSITIONS[ctx.listing.status as ListingStatus].includes(status)) {
    return { ok: false, message: "Ese cambio de estado no está permitido." };
  }
  const { error } = await ctx.supabase.from("listings").update({ status }).eq("id", id);
  if (error) return { ok: false, message: "No hemos podido cambiar el estado." };
  revalidatePath("/mis-anuncios");
  revalidatePath("/anuncios");
  revalidatePath(`/anuncios/${id}`);
  return { ok: true };
}

export async function deleteDraft(id: string): Promise<SaveResult> {
  const ctx = await requireOwnListing(id);
  if (!ctx) return NOT_FOUND;
  if (ctx.listing.status !== "draft") return { ok: false, message: "Solo se pueden borrar borradores." };
  const { error } = await ctx.supabase.from("listings").delete().eq("id", id);
  if (error) return { ok: false, message: "No hemos podido borrar el borrador." };
  if (ctx.listing.photos.length) await ctx.supabase.storage.from("listing-photos").remove(ctx.listing.photos);
  revalidatePath("/mis-anuncios");
  return { ok: true };
}

/** Duplica un anuncio como borrador nuevo (con copia de fotos y dirección). */
export async function duplicateListing(id: string): Promise<SaveResult> {
  const ctx = await requireOwnListing(id);
  if (!ctx) return NOT_FOUND;
  const { supabase, user } = ctx;

  const { data: src } = await supabase.from("listings").select("*").eq("id", id).single();
  if (!src) return NOT_FOUND;
  const {
    id: _id, status: _s, created_at: _c, updated_at: _u, published_at: _p, photos: _ph, ...rest
  } = src;
  void [_id, _s, _c, _u, _p, _ph];

  const { data: copy, error } = await supabase
    .from("listings")
    .insert({ ...rest, owner_id: user.id, status: "draft", title: `${src.title} (copia)`.slice(0, 120) })
    .select("id")
    .single();
  if (error || !copy) return { ok: false, message: "No hemos podido duplicar el anuncio." };

  const newPhotos: string[] = [];
  for (const path of src.photos) {
    const target = `${user.id}/${copy.id}/${path.split("/").pop()}`;
    const { error: copyError } = await supabase.storage.from("listing-photos").copy(path, target);
    if (!copyError) newPhotos.push(target);
  }
  if (newPhotos.length) await supabase.from("listings").update({ photos: newPhotos }).eq("id", copy.id);

  const { data: addr } = await supabase.from("listing_addresses").select("*").eq("listing_id", id).maybeSingle();
  if (addr) {
    await supabase.from("listing_addresses").insert({
      listing_id: copy.id,
      address_line: addr.address_line,
      floor_door: addr.floor_door,
      postal_code: addr.postal_code,
    });
  }

  revalidatePath("/mis-anuncios");
  redirect(`/publicar/${copy.id}?paso=datos`);
}
