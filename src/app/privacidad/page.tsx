import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Política de privacidad (borrador)", robots: { index: false } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad" updated="6 de noviembre de 2026">
      <section>
        <h2>1. Quién es el responsable</h2>
        <ul>
          <li>Responsable: [POR COMPLETAR: nombre o razón social]</li>
          <li>NIF/CIF: [POR COMPLETAR]</li>
          <li>Domicilio: [POR COMPLETAR]</li>
          <li>Email de contacto para privacidad: [POR COMPLETAR]</li>
          <li>Delegado de protección de datos: [POR COMPLETAR: indicar si se nombra o si no es obligatorio]</li>
        </ul>
      </section>

      <section>
        <h2>2. Qué datos tratamos</h2>
        <ul>
          <li><strong>Cuenta:</strong> email, contraseña (cifrada, nunca la vemos) y nombre visible.</li>
          <li>
            <strong>Perfil público</strong> (lo que tú decidas poner): foto, presentación, ciudad, ocupación, rango de edad
            (no la fecha de nacimiento), idiomas y hábitos de convivencia de una lista cerrada.
          </li>
          <li>
            <strong>Anuncios:</strong> descripción, precio, fotos (sin datos de ubicación GPS) y la dirección exacta, que solo
            ven las personas cuyo interés aceptas.
          </li>
          <li><strong>Conversaciones:</strong> los mensajes que intercambias con otros usuarios.</li>
          <li><strong>Estancias y reseñas:</strong> las fechas de convivencia confirmadas y las reseñas que escribes o recibes.</li>
          <li>
            <strong>Datos técnicos de seguridad:</strong> una huella cifrada (HMAC) de tu dirección IP y de tu navegador. No
            guardamos la IP en claro y no se puede recuperar a partir de la huella.
          </li>
        </ul>
        <p>
          <strong>No pedimos ni guardamos</strong> DNI, nacionalidad, origen, religión, datos de salud ni otras categorías
          especiales de datos. Te pedimos que no los incluyas en tus textos.
        </p>
      </section>

      <section>
        <h2>3. Para qué los usamos y con qué base legal</h2>
        <table>
          <thead>
            <tr>
              <th>Finalidad</th>
              <th>Base legal (art. 6 RGPD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Crear tu cuenta, publicar anuncios, contactar con otras personas y gestionar estancias</td>
              <td>Ejecución del contrato (condiciones de uso)</td>
            </tr>
            <tr>
              <td>Publicar reseñas verificadas tras una estancia confirmada</td>
              <td>Ejecución del contrato e interés legítimo en una reputación fiable [POR COMPLETAR: validar]</td>
            </tr>
            <tr>
              <td>Emails de servicio (nuevo interés, estancia propuesta, avisos de reseña)</td>
              <td>Ejecución del contrato</td>
            </tr>
            <tr>
              <td>Seguridad, prevención de fraude y de reseñas falsas, límites de intentos de acceso</td>
              <td>Interés legítimo</td>
            </tr>
            <tr>
              <td>
                Gestionar notificaciones de contenido ilegal, también de personas sin cuenta (nombre, email y lo que nos
                cuentan)
              </td>
              <td>Obligación legal (Reglamento de Servicios Digitales, arts. 16 y 17)</td>
            </tr>
            <tr>
              <td>Moderación de denuncias y cumplimiento de obligaciones legales</td>
              <td>Obligación legal e interés legítimo</td>
            </tr>
          </tbody>
        </table>
        <p>No vendemos tus datos ni los usamos para publicidad. [POR COMPLETAR: revisar si cambia el modelo de negocio]</p>
      </section>

      <section>
        <h2>4. Quién más los trata (encargados)</h2>
        <ul>
          <li><strong>Supabase</strong>: base de datos, cuentas y almacenamiento de fotos. Servidores en la Unión Europea. [POR COMPLETAR: región exacta y contrato de encargo]</li>
          <li><strong>Vercel</strong>: alojamiento de la web. Funciones en París (UE). [POR COMPLETAR: transferencias internacionales y cláusulas contractuales tipo]</li>
          <li><strong>Resend</strong>: envío de emails. [POR COMPLETAR: ubicación y garantías de transferencia]</li>
        </ul>
        <p>Otros usuarios ven lo que haces público: tu perfil, tus anuncios y tus reseñas publicadas.</p>
      </section>

      <section>
        <h2>5. Cuánto tiempo los guardamos</h2>
        <ul>
          <li>Datos de la cuenta, perfil y anuncios: mientras la cuenta exista.</li>
          <li>
            Reseñas: se conservan aunque borres la cuenta, <strong>desvinculadas de tu cuenta</strong> (aparecen como «Usuario
            eliminado»), para no borrar la reputación de otras personas. No es un anonimizado completo: quien convivió
            contigo puede deducir quién la escribió por la estancia. Base legal: interés legítimo (art. 6.1.f RGPD) y la
            excepción de libertad de expresión e información al derecho de supresión (art. 17.3.a). [POR COMPLETAR: validar
            con el abogado y decidir si se corta también el enlace con la estancia]
          </li>
          <li>Huellas de seguridad de los intentos de acceso: se eliminan a partir de las 24 horas.</li>
          <li>Huellas anti-abuso de las reseñas: [POR COMPLETAR: plazo, p. ej. 12 meses]</li>
          <li>Denuncias, notificaciones de contenido ilegal y registro de moderación: [POR COMPLETAR: plazo; propuesta en docs/legal/conservacion.md]</li>
          <li>Copias de seguridad: [POR COMPLETAR: plazo según el plan de Supabase]</li>
        </ul>
      </section>

      <section>
        <h2>6. Tus derechos</h2>
        <p>
          Puedes acceder, rectificar, suprimir, oponerte, limitar el tratamiento y pedir la portabilidad de tus datos. Desde{" "}
          <Link href="/cuenta" className="font-semibold text-brand underline">
            Mi cuenta y mis datos
          </Link>{" "}
          puedes descargar todos tus datos y borrar tu cuenta tú mismo. Para lo demás, escríbenos a [POR COMPLETAR: email].
        </p>
        <p>
          Si crees que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos
          (aepd.es).
        </p>
      </section>

      <section>
        <h2>7. Cookies</h2>
        <p>
          Solo usamos <strong>cookies técnicas imprescindibles</strong>: las de inicio de sesión (empiezan por{" "}
          <code>sb-</code>), que sirven para recordar que has entrado. No usamos cookies de analítica, publicidad ni de
          terceros, así que no te mostramos un aviso de cookies. Si eso cambia, te pediremos permiso antes.
        </p>
      </section>

      <section>
        <h2>8. Menores</h2>
        <p>
          Convivo es solo para mayores de 18 años: al registrarte declaras que lo eres, y el rango de edad del perfil empieza
          en 18. No pedimos DNI. Si sabemos que una cuenta es de un menor, la suspendemos y borramos sus datos. Puedes
          avisarnos desde el <a href="/denunciar" className="font-semibold text-brand underline">formulario de denuncias</a>.
        </p>
      </section>
    </LegalPage>
  );
}
