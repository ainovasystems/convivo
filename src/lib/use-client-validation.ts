"use client";

import { useState, type FormEvent } from "react";
import type { z } from "zod";

import { fieldErrors } from "@/lib/validation/profile";

/**
 * Validación en cliente con el MISMO esquema Zod que usa el servidor.
 * Si falla, cancela el envío y muestra los errores sin ir a la red.
 * (El servidor vuelve a validar siempre: esto es solo comodidad.)
 */
export function useClientValidation<S extends z.ZodType>(
  schema: S,
  toObject: (fd: FormData) => unknown = (fd) => Object.fromEntries(fd),
) {
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const result = schema.safeParse(toObject(new FormData(event.currentTarget)));
    if (!result.success) {
      event.preventDefault();
      const errors = fieldErrors(result.error);
      setClientErrors(errors);
      const first = Object.keys(errors)[0];
      const el = first ? event.currentTarget.querySelector<HTMLElement>(`[name="${first.split(".")[0]}"]`) : null;
      el?.focus();
    } else {
      setClientErrors({});
    }
  }

  return { clientErrors, onSubmit };
}
