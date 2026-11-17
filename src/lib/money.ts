/**
 * Importes en euros, SIEMPRE exactos y con el mismo formato en toda la app:
 * coma decimal, dos decimales solo si hay céntimos («12,50 €», «900 €») y punto
 * de millares a partir de 10.000 («12.345,60 €»). Nunca redondea a euros.
 * La base de datos escribe los avisos con el mismo criterio (`private.format_eur`).
 */
const whole = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(amount: number): string {
  const c = Math.round(amount * 100);
  return c % 100 === 0 ? whole.format(c / 100) : cents.format(c / 100);
}
