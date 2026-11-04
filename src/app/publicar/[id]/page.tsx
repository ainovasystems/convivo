import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ListingWizard, type WizardValues } from "@/components/listings/listing-wizard";
import { getCurrentUser } from "@/lib/auth";
import { KIND_LABELS, RULE_KEYS } from "@/lib/listings/options";
import { getOwnListingForEdit } from "@/lib/listings/queries";

export const metadata: Metadata = { title: "Editar anuncio", robots: { index: false } };

const stepSchema = z.enum(["datos", "fotos", "revision"]).catch("datos");
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const tri = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  if (!user) redirect(`/entrar?next=/publicar/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  const data = await getOwnListingForEdit(id, user.id);
  if (!data) notFound();
  const { listing: l, address } = data;
  if (l.status === "closed") redirect("/mis-anuncios");

  const rules = (l.rules ?? {}) as Record<string, boolean>;
  const initialValues: WizardValues = {
    title: l.title,
    description: l.description,
    city: str(l.city),
    province: str(l.province),
    neighborhood: str(l.neighborhood),
    monthlyRent: str(l.monthly_rent),
    deposit: str(l.deposit),
    availableFrom: str(l.available_from),
    minStayMonths: str(l.min_stay_months),
    billsIncluded: tri(l.bills_included),
    furnished: tri(l.furnished),
    sizeM2: str(l.size_m2),
    bedrooms: str(l.bedrooms),
    bathrooms: str(l.bathrooms),
    currentFlatmates: str(l.current_flatmates),
    maxBudget: str(l.max_budget),
    zones: l.zones.join(", "),
    moveInDate: str(l.move_in_date),
    addressLine: str(address?.address_line),
    floorDoor: str(address?.floor_door),
    postalCode: str(address?.postal_code),
    rules: Object.fromEntries(RULE_KEYS.filter((k) => k in rules).map((k) => [k, rules[k] ? "yes" : "no"])),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">
        {l.status === "draft" ? "Publicar" : "Editar"}: {KIND_LABELS[l.kind].toLowerCase()}
      </h1>
      <ListingWizard
        listing={{ id: l.id, kind: l.kind, status: l.status, photos: l.photos, ownerId: l.owner_id }}
        initialValues={initialValues}
        initialStep={stepSchema.parse(typeof sp.paso === "string" ? sp.paso : undefined)}
      />
    </div>
  );
}
