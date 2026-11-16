# Emails de acceso de Hommie (Supabase Auth)

> Borrador pendiente de revisión legal, como el resto de textos. Los emails de la app (nuevo interés, contratos, fianza…) ya salen como «Hommie» desde el código; **estos cinco los envía Supabase** y hay que pegarlos a mano en su panel. Este fichero no toca ningún proyecto de Supabase.

## Antes de empezar

- Hazlo primero en **«Convivo pruebas»** (así ves el resultado) y, cuando estés conforme, repite los mismos pasos en el proyecto de producción.
- Tarda unos 10 minutos. Solo hay que copiar y pegar: **no cambies nada de lo que va entre llaves dobles**, como `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}` o `{{ .NewEmail }}`. Supabase los rellena solo.

## Pasos (una vez por cada email)

1. Entra en [supabase.com/dashboard](https://supabase.com/dashboard) y abre el proyecto.
2. En el menú de la izquierda: **Authentication** → **Emails** (en algunas versiones del panel, **Email Templates**).
3. Arriba verás las pestañas con los tipos de email. Haz clic en el que toque (el nombre en inglés está entre paréntesis en cada apartado de abajo).
4. En **Subject** (asunto), borra lo que haya y pega el asunto de este documento.
5. En **Message body** (cuerpo), borra todo y pega el HTML de este documento. Si hay una pestaña «Source» (código), usa esa.
6. Pulsa **Save** (guardar).

## Una vez, para el remitente

El nombre que ve quien recibe el email (el remitente) no está en estas plantillas: se configura en **Authentication** → **Emails** → **SMTP Settings**, campo **Sender name**. Pon `Hommie`. Esto va junto con la configuración de Resend y del dominio `hommie.es` (ver `docs/DEPLOY.md`).

## Comprobación

Después de guardar los cinco: crea una cuenta de prueba (confirmar cuenta), y pide un enlace mágico desde «Entrar». Los otros tres (cambio de contraseña, cambio de email y código de seguridad) la app todavía no los dispara por sí sola: se pueden mandar a mano desde **Authentication → Users**, en el menú de cada usuario. Cada email debe decir «Hommie», estar en español y llevar un botón que funcione. Si ves texto en inglés, esa plantilla no se guardó.

---

## 1. Confirmar cuenta (Confirm signup)

**Asunto (Subject):**

```
Confirma tu cuenta en Hommie
```

**Cuerpo (Message body):**

```html
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f2ec;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;color:#2b211a;line-height:1.5">
    <p style="margin:0 0 24px;font-weight:700;font-size:20px;color:#7b4b2a">Hommie</p>
    <h1 style="margin:0 0 12px;font-size:20px">Confirma tu cuenta</h1>
    <p style="margin:0 0 12px">¡Te damos la bienvenida a Hommie! Para empezar, confirma que este email es tuyo.</p>
    <p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#7b4b2a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px;display:inline-block">Confirmar mi cuenta</a></p>
    <p style="margin:0 0 16px;font-size:13px;color:#6f5e50">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="{{ .ConfirmationURL }}" style="color:#7b4b2a;word-break:break-all">{{ .ConfirmationURL }}</a></p>
    <p style="margin:16px 0 0;font-size:13px;color:#6f5e50">Si no has creado una cuenta en Hommie, puedes ignorar este mensaje: no pasará nada.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#6f5e50">Recibes este email porque tienes una cuenta en Hommie, o alguien la ha creado con tu dirección.</p>
  </div>
</div>
```

## 2. Enlace mágico (Magic Link)

**Asunto (Subject):**

```
Tu enlace para entrar en Hommie
```

**Cuerpo (Message body):**

```html
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f2ec;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;color:#2b211a;line-height:1.5">
    <p style="margin:0 0 24px;font-weight:700;font-size:20px;color:#7b4b2a">Hommie</p>
    <h1 style="margin:0 0 12px;font-size:20px">Entra en Hommie</h1>
    <p style="margin:0 0 12px">Pulsa el botón para entrar en tu cuenta sin escribir la contraseña. El enlace sirve una sola vez y caduca pronto.</p>
    <p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#7b4b2a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px;display:inline-block">Entrar en Hommie</a></p>
    <p style="margin:0 0 16px;font-size:13px;color:#6f5e50">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="{{ .ConfirmationURL }}" style="color:#7b4b2a;word-break:break-all">{{ .ConfirmationURL }}</a></p>
    <p style="margin:16px 0 0;font-size:13px;color:#6f5e50">Si no has pedido este enlace, ignora este mensaje. Nadie puede entrar en tu cuenta sin él.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#6f5e50">Recibes este email porque tienes una cuenta en Hommie, o alguien la ha creado con tu dirección.</p>
  </div>
</div>
```

## 3. Cambio de contraseña (Reset Password)

**Asunto (Subject):**

```
Cambia tu contraseña de Hommie
```

**Cuerpo (Message body):**

```html
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f2ec;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;color:#2b211a;line-height:1.5">
    <p style="margin:0 0 24px;font-weight:700;font-size:20px;color:#7b4b2a">Hommie</p>
    <h1 style="margin:0 0 12px;font-size:20px">Cambia tu contraseña</h1>
    <p style="margin:0 0 12px">Hemos recibido una petición para cambiar la contraseña de tu cuenta de Hommie.</p>
    <p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#7b4b2a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px;display:inline-block">Elegir una contraseña nueva</a></p>
    <p style="margin:0 0 16px;font-size:13px;color:#6f5e50">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="{{ .ConfirmationURL }}" style="color:#7b4b2a;word-break:break-all">{{ .ConfirmationURL }}</a></p>
    <p style="margin:16px 0 0;font-size:13px;color:#6f5e50">Si no has sido tú, ignora este mensaje: tu contraseña actual sigue funcionando.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#6f5e50">Recibes este email porque tienes una cuenta en Hommie, o alguien la ha creado con tu dirección.</p>
  </div>
</div>
```

## 4. Cambio de email (Change Email Address)

**Asunto (Subject):**

```
Confirma tu nuevo email en Hommie
```

**Cuerpo (Message body):**

```html
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f2ec;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;color:#2b211a;line-height:1.5">
    <p style="margin:0 0 24px;font-weight:700;font-size:20px;color:#7b4b2a">Hommie</p>
    <h1 style="margin:0 0 12px;font-size:20px">Confirma tu nuevo email</h1>
    <p style="margin:0 0 12px">Has pedido cambiar el email de tu cuenta de Hommie de {{ .Email }} a {{ .NewEmail }}. Confirma el cambio con este botón.</p>
    <p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#7b4b2a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px;display:inline-block">Confirmar el cambio de email</a></p>
    <p style="margin:0 0 16px;font-size:13px;color:#6f5e50">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="{{ .ConfirmationURL }}" style="color:#7b4b2a;word-break:break-all">{{ .ConfirmationURL }}</a></p>
    <p style="margin:16px 0 0;font-size:13px;color:#6f5e50">Si no has pedido este cambio, no pulses el botón y cambia tu contraseña por seguridad.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#6f5e50">Recibes este email porque tienes una cuenta en Hommie, o alguien la ha creado con tu dirección.</p>
  </div>
</div>
```

## 5. Reautenticación (Reauthentication)

**Asunto (Subject):**

```
Tu código de seguridad de Hommie
```

**Cuerpo (Message body):**

```html
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f2ec;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;color:#2b211a;line-height:1.5">
    <p style="margin:0 0 24px;font-weight:700;font-size:20px;color:#7b4b2a">Hommie</p>
    <h1 style="margin:0 0 12px;font-size:20px">Tu código de seguridad</h1>
    <p style="margin:0 0 12px">Para confirmar que eres tú, introduce este código en Hommie:</p>
    <p style="margin:24px 0;font-size:32px;font-weight:800;letter-spacing:6px;color:#7b4b2a">{{ .Token }}</p>
    <p style="margin:16px 0 0;font-size:13px;color:#6f5e50">El código caduca en poco tiempo. Si no lo has pedido, ignora este mensaje y considera cambiar tu contraseña.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#6f5e50">Recibes este email porque tienes una cuenta en Hommie, o alguien la ha creado con tu dirección.</p>
  </div>
</div>
```

## Notas

- La plantilla «Invite user» (invitar a un usuario desde el panel) no se usa en Hommie: no hace falta tocarla.
- Si más adelante se cambia el diseño de los emails de la app (`src/lib/email/templates.ts`), conviene actualizar estos para que se parezcan.
- Los enlaces de estos emails salen de la **Site URL** y las **Redirect URLs** de Authentication → URL Configuration (ver `docs/CHECKLIST-LANZAMIENTO.md`).
