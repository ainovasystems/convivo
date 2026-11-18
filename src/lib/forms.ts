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

/** Lo que responden las acciones cuando la sesión ha caducado a mitad de un formulario. */
export const SESSION_EXPIRED_MESSAGE = "Tu sesión ha caducado. Vuelve a entrar.";
