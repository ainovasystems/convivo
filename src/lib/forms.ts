/** Estado que devuelven las Server Actions de formularios. */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string>;
  /**
   * Lo que escribió el usuario (nunca contraseñas), para volver a rellenar el
   * formulario: React 19 lo vacía al terminar la acción.
   */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };
