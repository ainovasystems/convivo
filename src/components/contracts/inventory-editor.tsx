"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  addInventoryItem,
  confirmInventory,
  copyEntryItems,
  deleteInventoryItem,
  discardInventoryPhotos,
  openInventory,
  updateInventoryItem,
  type InventoryResult,
} from "@/app/contratos/[id]/inventario/actions";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/submit-button";
import {
  AREA_SUGGESTIONS,
  CONDITION_LABELS,
  groupByArea,
  inventoryChanges,
  ITEM_CONDITIONS,
  MAX_ITEM_PHOTOS,
  type InventoryStage,
  type ItemCondition,
} from "@/lib/contracts/inventory";
import type { InventoryItemView } from "@/lib/contracts/inventory-queries";
import { compressImage } from "@/lib/images/compress";
import { createClient } from "@/lib/supabase/client";

const CONDITION_TONE: Record<ItemCondition, string> = {
  new: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  good: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  worn: "bg-amber-50 text-amber-900 ring-amber-200",
  damaged: "bg-red-50 text-red-900 ring-red-200",
};

function Message({ result }: { result: InventoryResult | null }) {
  if (!result?.message) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={"text-sm " + (result.ok ? "text-emerald-800" : "text-red-700")}>
      {result.message}
    </p>
  );
}

/** Botón para abrir el inventario cuando todavía no existe. */
export function OpenInventoryButton({ contractId, stage }: { contractId: string; stage: InventoryStage }) {
  const router = useRouter();
  const [result, setResult] = useState<InventoryResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={buttonClass}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await openInventory(contractId, stage);
            setResult(r);
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? "Abriendo…" : "Empezar el inventario"}
      </button>
      <Message result={result} />
    </div>
  );
}

/** Comprime y sube fotos a la carpeta del inventario. Devuelve las que han subido bien y si alguna ha fallado. */
async function uploadInventoryPhotos(files: File[], contractId: string, inventoryId: string) {
  const supabase = createClient();
  const added: { path: string; preview: string }[] = [];
  let failed = false;
  try {
    for (const file of files) {
      const blob = await compressImage(file);
      const path = `${contractId}/${inventoryId}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from("inventory-photos").upload(path, blob, { contentType: "image/webp" });
      if (error) throw error;
      added.push({ path, preview: URL.createObjectURL(blob) });
    }
  } catch {
    failed = true;
  }
  return { added, failed };
}
const UPLOAD_FAILED = "No se pudo subir alguna foto. Prueba con otra imagen (JPG, PNG o WebP).";

type Props = {
  contractId: string;
  inventoryId: string;
  /** Versión del inventario que se está viendo: se envía al confirmar. */
  revision: number;
  stage: InventoryStage;
  items: InventoryItemView[];
  locked: boolean;
  iConfirmed: boolean;
  otherConfirmed: boolean;
  otherName: string;
  /** Solo en la salida: estado de cada elemento en la entrada (clave «zona|elemento» en minúsculas). */
  entryConditions?: Record<string, ItemCondition>;
  canCopyEntry?: boolean;
};

export function InventoryEditor(props: Props) {
  const { contractId, inventoryId, revision, items, locked, iConfirmed, otherConfirmed, otherName, entryConditions, canCopyEntry } = props;
  const router = useRouter();
  const [result, setResult] = useState<InventoryResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  // Lo que tenía delante quien intentó confirmar un inventario que ya había cambiado.
  const [staleSeen, setStaleSeen] = useState<InventoryItemView[] | null>(null);
  const run = (fn: () => Promise<InventoryResult>) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        setStaleSeen(null);
        router.refresh();
      }
    });
  const confirm = () => {
    if (
      !window.confirm(
        "¿Confirmas que el inventario es correcto tal como lo ves ahora?\n\nCuando lo confirméis los dos quedará bloqueado y ya no se podrá cambiar.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await confirmInventory(inventoryId, revision);
      setResult(r);
      if (r.stale) {
        // No se ha guardado nada: se trae lo nuevo y se marca qué ha cambiado.
        setStaleSeen(items);
        router.refresh();
      } else if (r.ok) {
        setStaleSeen(null);
        router.refresh();
      }
    });
  };
  const changes = useMemo(() => (staleSeen ? inventoryChanges(staleSeen, items) : null), [staleSeen, items]);
  const changedIds = new Set([...(changes?.added ?? []), ...(changes?.edited ?? [])]);
  const groups = groupByArea(items);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section aria-label="Elementos del inventario" className="space-y-5">
        {changes ? (
          <div role="alert" data-testid="inventory-changed" className="space-y-2 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 print:hidden">
            <p className="font-bold">El inventario ha cambiado: tu confirmación no se ha guardado.</p>
            <p>
              {otherName} lo ha modificado mientras lo tenías abierto. Ya estás viendo la versión actual
              {changes.added.length + changes.edited.length > 0 ? ", con lo nuevo o corregido marcado" : ""}. Revísala y, si estás de acuerdo, vuelve a confirmar.
            </p>
            {changes.removed.length > 0 ? <p>Se ha quitado: {changes.removed.join("; ")}.</p> : null}
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="space-y-3 rounded-2xl bg-surface p-5 text-muted">
            <p>Todavía no hay elementos. Id añadiendo, zona por zona, lo que hay y cómo está, con fotos.</p>
            {canCopyEntry && !locked ? (
              <button type="button" className="font-semibold text-brand underline" disabled={pending} onClick={() => run(() => copyEntryItems(inventoryId))}>
                Copiar los elementos del inventario de entrada
              </button>
            ) : null}
          </div>
        ) : null}
        {groups.map((g) => (
          <div key={g.area} className="space-y-3">
            <h2 className="text-lg font-bold">{g.area}</h2>
            <ul className="space-y-3">
              {g.items.map((item) => {
                const before = entryConditions?.[`${item.area.toLowerCase()}|${item.name.toLowerCase()}`];
                const newDamage = before !== undefined && before !== "damaged" && item.condition === "damaged";
                return (
                  <li
                    key={item.id}
                    className={"space-y-2 rounded-2xl border p-4 break-inside-avoid " + (changedIds.has(item.id) ? "border-2 border-amber-400 bg-amber-50/60" : "border-border")}
                  >
                    {changedIds.has(item.id) ? (
                      <p className="text-xs font-bold tracking-wide text-amber-900 uppercase print:hidden">
                        {changes?.added.includes(item.id) ? "Nuevo desde que lo abriste" : "Corregido desde que lo abriste"}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{item.name}</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${CONDITION_TONE[item.condition]}`}>
                        {CONDITION_LABELS[item.condition]}
                      </span>
                    </div>
                    {before !== undefined ? (
                      <p className={"text-sm " + (newDamage ? "font-semibold text-red-800" : "text-muted")}>
                        A la entrada: {CONDITION_LABELS[before]}
                        {newDamage ? " · daño nuevo" : ""}
                      </p>
                    ) : null}
                    {item.notes ? <p className="text-sm whitespace-pre-line">{item.notes}</p> : null}
                    {item.photos.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {item.photos.map((p, i) =>
                          p.url ? (
                            <a key={p.path} href={p.url} target="_blank" rel="noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de un bucket privado */}
                              <img src={p.url} alt={`${item.name}, foto ${i + 1}`} className="size-24 rounded-xl object-cover ring-1 ring-border" />
                            </a>
                          ) : null,
                        )}
                      </div>
                    ) : null}
                    {!locked && editing === item.id ? (
                      <EditItemForm
                        contractId={contractId}
                        inventoryId={inventoryId}
                        item={item}
                        onCancel={() => setEditing(null)}
                        onSaved={(r) => {
                          setEditing(null);
                          setResult(r);
                          setStaleSeen(null);
                          router.refresh();
                        }}
                      />
                    ) : !locked ? (
                      <div className="flex flex-wrap gap-x-5 print:hidden">
                        <button
                          type="button"
                          className="py-2 text-sm font-semibold text-brand underline"
                          disabled={pending}
                          aria-label={`Corregir ${item.name}`}
                          onClick={() => setEditing(item.id)}
                        >
                          Corregir
                        </button>
                        <button
                          type="button"
                          className="py-2 text-sm font-semibold text-red-700 underline"
                          disabled={pending}
                          aria-label={`Quitar ${item.name}`}
                          onClick={() => {
                            if (window.confirm(`¿Quitar «${item.name}» del inventario?`)) run(() => deleteInventoryItem(item.id));
                          }}
                        >
                          Quitar
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <aside className="space-y-4 print:hidden">
        <div className="space-y-3 rounded-3xl border-2 border-brand/30 bg-brand-soft/40 p-5">
          <h2 className="text-lg font-bold">Confirmación</h2>
          {locked ? (
            <p className="font-semibold">Confirmado por las dos partes. Este inventario ya no se puede cambiar.</p>
          ) : (
            <>
              <p className="text-sm">
                {iConfirmed ? "Ya lo has confirmado." : "Todavía no lo has confirmado."}{" "}
                {otherConfirmed ? `${otherName} ya lo ha confirmado.` : `${otherName} todavía no lo ha confirmado.`}
              </p>
              <p className="text-sm text-muted">Si alguien cambia algo, las confirmaciones se anulan y hay que volver a revisarlo.</p>
              {!iConfirmed ? (
                <button type="button" className={buttonClass} disabled={pending || items.length === 0} onClick={confirm}>
                  {pending ? "Confirmando…" : "Confirmo que el inventario es correcto"}
                </button>
              ) : null}
            </>
          )}
          <Message result={result} />
        </div>
        {!locked ? <AddItemForm {...props} onDone={() => router.refresh()} /> : null}
      </aside>
    </div>
  );
}

function AddItemForm({ contractId, inventoryId, onDone }: Props & { onDone: () => void }) {
  const [area, setArea] = useState("");
  const [name, setName] = useState("");
  const [condition, setCondition] = useState<ItemCondition | "">("good");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<{ path: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<InventoryResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Al salir sin guardar, se borran del bucket las fotos ya subidas.
  useEffect(
    () => () => {
      const left = photosRef.current.map((p) => p.path);
      if (left.length > 0) void discardInventoryPhotos(inventoryId, left);
    },
    [inventoryId],
  );

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_ITEM_PHOTOS - photos.length;
    const selected = Array.from(files).slice(0, room);
    setUploading(true);
    setResult(null);
    const { added, failed } = await uploadInventoryPhotos(selected, contractId, inventoryId);
    if (failed) setResult({ ok: false, message: UPLOAD_FAILED });
    setPhotos((p) => [...p, ...added]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePhoto(path: string) {
    setPhotos((p) => p.filter((x) => x.path !== path));
    void discardInventoryPhotos(inventoryId, [path]);
  }

  function submit() {
    startTransition(async () => {
      const r = await addInventoryItem(inventoryId, { area, name, condition, notes, photos: photos.map((p) => p.path) });
      setResult(r);
      if (r.ok) {
        photosRef.current = [];
        setPhotos([]);
        setName("");
        setNotes("");
        setCondition("good");
        onDone();
      }
    });
  }

  return (
    <form
      className="space-y-4 rounded-3xl border border-border p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="text-lg font-bold">Añadir un elemento</h2>
      <TextField
        id="area"
        label="Zona"
        list="inventory-areas"
        value={area}
        onChange={(e) => setArea(e.target.value)}
        placeholder="Habitación, Cocina, Baño…"
        error={result?.errors?.area}
        required
      />
      <datalist id="inventory-areas">
        {AREA_SUGGESTIONS.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <TextField
        id="name"
        label="Elemento"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Colchón, nevera, paredes, llaves…"
        error={result?.errors?.name}
        required
      />
      <SelectField
        id="condition"
        label="Estado"
        value={condition}
        onChange={(e) => setCondition(e.target.value as ItemCondition)}
        options={ITEM_CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
        placeholder="Elige el estado"
        error={result?.errors?.condition}
        required
      />
      <TextAreaField
        id="notes"
        label="Notas (opcional)"
        rows={3}
        maxLength={500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        hint="Por ejemplo: «arañazo en la puerta izquierda» o «faltan dos tornillos»."
        error={result?.errors?.notes}
      />
      <div className="space-y-2">
        <label htmlFor="photos" className="block text-sm font-semibold">
          Fotos ({photos.length}/{MAX_ITEM_PHOTOS})
        </label>
        <input
          ref={fileRef}
          id="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          capture="environment"
          disabled={uploading || photos.length >= MAX_ITEM_PHOTOS}
          onChange={(e) => void onFiles(e.target.files)}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:py-2 file:font-semibold file:text-brand"
        />
        <p className="text-sm text-muted">Solo las veis vosotros dos. Se guardan sin la ubicación GPS.</p>
        {uploading ? <p role="status" className="text-sm">Subiendo fotos…</p> : null}
        {photos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p.path} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                <img src={p.preview} alt={`Foto ${i + 1} sin guardar`} className="size-20 rounded-xl object-cover ring-1 ring-border" />
                <button
                  type="button"
                  onClick={() => removePhoto(p.path)}
                  className="absolute -top-2 -right-2 rounded-full bg-white px-2 text-sm font-bold text-red-700 shadow ring-1 ring-border"
                  aria-label={`Quitar la foto ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <button type="submit" className={buttonClass} disabled={pending || uploading}>
        {pending ? "Guardando…" : "Añadir al inventario"}
      </button>
      <Message result={result} />
    </form>
  );
}

/** Corrige el estado, las notas y las fotos de un elemento sin quitarlo (la zona y el nombre no cambian). */
function EditItemForm({
  contractId,
  inventoryId,
  item,
  onCancel,
  onSaved,
}: {
  contractId: string;
  inventoryId: string;
  item: InventoryItemView;
  onCancel: () => void;
  onSaved: (r: InventoryResult) => void;
}) {
  const [condition, setCondition] = useState<ItemCondition>(item.condition);
  const [notes, setNotes] = useState(item.notes);
  const [photos, setPhotos] = useState<{ path: string; preview: string | null }[]>(item.photos.map((p) => ({ path: p.path, preview: p.url })));
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<InventoryResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  // Fotos subidas en esta edición y todavía sin guardar: si se cancela, se borran del bucket.
  const uploadedRef = useRef<string[]>([]);
  const savedRef = useRef(false);
  useEffect(
    () => () => {
      if (!savedRef.current && uploadedRef.current.length > 0) void discardInventoryPhotos(inventoryId, uploadedRef.current);
    },
    [inventoryId],
  );

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files).slice(0, MAX_ITEM_PHOTOS - photos.length);
    setUploading(true);
    setResult(null);
    const { added, failed } = await uploadInventoryPhotos(selected, contractId, inventoryId);
    if (failed) setResult({ ok: false, message: UPLOAD_FAILED });
    uploadedRef.current = [...uploadedRef.current, ...added.map((a) => a.path)];
    setPhotos((p) => [...p, ...added]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePhoto(path: string) {
    setPhotos((p) => p.filter((x) => x.path !== path));
    // Las ya guardadas se borran del bucket al guardar; las recién subidas, ahora.
    if (uploadedRef.current.includes(path)) {
      uploadedRef.current = uploadedRef.current.filter((x) => x !== path);
      void discardInventoryPhotos(inventoryId, [path]);
    }
  }

  const id = `edit-${item.id}`;
  return (
    <form
      aria-label={`Corregir ${item.name}`}
      className="space-y-3 rounded-2xl bg-surface p-4 print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await updateInventoryItem(item.id, { condition, notes, photos: photos.map((p) => p.path) });
          if (r.ok) {
            savedRef.current = true;
            onSaved(r);
          } else {
            setResult(r);
          }
        });
      }}
    >
      <p className="text-sm text-muted">
        Corrige el estado, las notas o las fotos. La zona y el nombre no cambian, para no perder la comparación con el inventario de entrada. Al guardar se
        anulan las confirmaciones.
      </p>
      <SelectField
        id={`${id}-condition`}
        label="Estado"
        value={condition}
        onChange={(e) => setCondition(e.target.value as ItemCondition)}
        options={ITEM_CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
        error={result?.errors?.condition}
        required
      />
      <TextAreaField
        id={`${id}-notes`}
        label="Notas (opcional)"
        rows={3}
        maxLength={500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        error={result?.errors?.notes}
      />
      <div className="space-y-2">
        <label htmlFor={`${id}-photos`} className="block text-sm font-semibold">
          Fotos ({photos.length}/{MAX_ITEM_PHOTOS})
        </label>
        <input
          ref={fileRef}
          id={`${id}-photos`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          capture="environment"
          disabled={uploading || photos.length >= MAX_ITEM_PHOTOS}
          onChange={(e) => void onFiles(e.target.files)}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-4 file:py-2 file:font-semibold file:text-brand"
        />
        {uploading ? <p role="status" className="text-sm">Subiendo fotos…</p> : null}
        {photos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p.path} className="relative">
                {p.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmada o vista previa local
                  <img src={p.preview} alt={`${item.name}, foto ${i + 1} (en edición)`} className="size-20 rounded-xl object-cover ring-1 ring-border" />
                ) : (
                  <span className="flex size-20 items-center justify-center rounded-xl text-xs text-muted ring-1 ring-border">Foto {i + 1}</span>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p.path)}
                  className="absolute -top-2 -right-2 rounded-full bg-white px-2 text-sm font-bold text-red-700 shadow ring-1 ring-border"
                  aria-label={`Quitar la foto ${i + 1} de ${item.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className={buttonClass} disabled={pending || uploading}>
          {pending ? "Guardando…" : "Guardar la corrección"}
        </button>
        <button type="button" className="py-2 text-sm font-semibold underline" disabled={pending} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      <Message result={result} />
    </form>
  );
}
