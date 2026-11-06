import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Condiciones de uso (borrador)", robots: { index: false } };

export default function TermsPage() {
  return (
    <LegalPage title="Condiciones de uso" updated="6 de noviembre de 2026">
      <section>
        <h2>1. Qué es Convivo</h2>
        <p>
          Convivo es una plataforma para encontrar habitación, piso o compañeros de piso, con perfiles y reseñas de
          personas que han convivido de verdad. La presta [POR COMPLETAR: titular, NIF y domicilio].
        </p>
        <p>
          <strong>Convivo no es parte de los contratos de alquiler</strong> ni cobra rentas, fianzas ni comisiones: pone en
          contacto a las personas. El acuerdo de alquiler o de convivencia es solo entre ellas. [POR COMPLETAR: revisar con
          el abogado la condición de prestador de servicios de la sociedad de la información (LSSI) y la relación con la LAU]
        </p>
      </section>

      <section>
        <h2>2. Tu cuenta</h2>
        <ul>
          <li>Tienes que tener 18 años o más (un menor no puede firmar un alquiler). Lo declaras al registrarte; si se detecta que una cuenta es de un menor, se suspende y se borran sus datos.</li>
          <li>Los datos de tu perfil deben ser veraces. No suplantes a nadie.</li>
          <li>Eres responsable de guardar tu contraseña.</li>
          <li>
            Puedes borrar tu cuenta cuando quieras desde{" "}
            <Link href="/cuenta" className="font-semibold text-brand underline">
              Mi cuenta y mis datos
            </Link>
            .
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Anuncios</h2>
        <ul>
          <li>Publica solo viviendas que puedas alquilar o compartir legalmente, con fotos y precios reales.</li>
          <li>
            <strong>No se permiten anuncios discriminatorios</strong>: no se puede excluir a nadie por origen, nacionalidad,
            religión, orientación sexual u otros motivos protegidos.
          </li>
          <li>
            En habitaciones y en búsquedas de compañero se puede indicar con quién se quiere convivir («solo chicas», «solo
            chicos»), porque se comparte la vivienda. [POR COMPLETAR: validar con el abogado (Ley 15/2022) y, en su caso,
            limitarlo a viviendas en las que convive quien anuncia]
          </li>
          <li>No pidas pagos por adelantado antes de que la otra persona haya visto la vivienda.</li>
          <li>No incluyas en los textos datos personales de terceros.</li>
        </ul>
      </section>

      <section>
        <h2>4. Reseñas</h2>
        <ul>
          <li>Solo puedes reseñar tras una estancia confirmada por las dos partes, y solo a personas o viviendas de esa estancia.</li>
          <li>
            Las reseñas son públicas, no se pueden editar y se publican cuando la otra parte también reseña o pasados 14
            días (doble ciego).
          </li>
          <li>
            Deben ser honestas y basadas en tu experiencia. No se permiten insultos, datos personales (teléfono, dirección,
            salud…) ni acusaciones de delitos sin base. [POR COMPLETAR: revisar riesgo de difamación y procedimiento de
            retirada]
          </li>
          <li>La persona reseñada puede responder una vez, públicamente.</li>
          <li>
            Si borras tu cuenta, tus reseñas se conservan, desvinculadas de tu cuenta: aparecen como «Usuario eliminado». Puedes eliminar una reseña tuya indicando el motivo; queda
            constancia de que existió.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Denuncias y moderación</h2>
        <ul>
          <li>
            Cualquier persona, tenga cuenta o no, puede notificar un anuncio, un perfil o una reseña que crea ilegal desde{" "}
            <Link href="/denunciar" className="font-semibold text-brand underline">
              Notificar contenido ilegal
            </Link>
            . Enviamos un acuse de recibo con una referencia y nuestro objetivo es decidir en un máximo de 72 horas.
          </li>
          <li>
            Las decisiones las toma una persona, no un sistema automático, y siempre se motivan: se comunican a quien notificó
            y, si se retira o restringe contenido, a quien lo publicó.
          </li>
          <li>Las reseñas denunciadas por contener datos personales se ocultan hasta que las revisamos.</li>
          <li>
            Si no estás de acuerdo con una decisión, responde al email en el que te la comunicamos o escribe a [POR COMPLETAR:
            email de reclamaciones] y la revisaremos de nuevo.
          </li>
          <li>Si detectamos indicios de un delito que amenace la vida o la seguridad de alguien, avisaremos a las autoridades.</li>
        </ul>
      </section>

      <section>
        <h2>6. Responsabilidad</h2>
        <p>
          [POR COMPLETAR: limitación de responsabilidad de la plataforma sobre los anuncios, los contratos entre usuarios, las
          fianzas y el estado de las viviendas.]
        </p>
      </section>

      <section>
        <h2>7. Cambios y ley aplicable</h2>
        <p>
          Avisaremos de los cambios importantes de estas condiciones. Se rigen por la ley española. [POR COMPLETAR: fuero y
          resolución de conflictos con consumidores]
        </p>
      </section>
    </LegalPage>
  );
}
