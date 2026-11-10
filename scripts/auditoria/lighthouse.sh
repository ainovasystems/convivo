#!/usr/bin/env bash
# Lighthouse en móvil (emulación por defecto) sobre las pantallas públicas.
# Uso: scripts/auditoria/lighthouse.sh <etiqueta> <carpeta-con-lighthouse> <url-base> <ruta>...
# La carpeta debe tener `npm i lighthouse@12` (no es dependencia del proyecto).
# Deja los JSON en docs/capturas-fase-7/lighthouse/<etiqueta>/ y un resumen por pantalla.
set -euo pipefail
label="$1"; lh="$2"; base="$3"; shift 3
out="docs/capturas-fase-7/lighthouse/$label"
mkdir -p "$out"
export CHROME_PATH="${CHROME_PATH:-$(ls /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1)}"
for ruta in "$@"; do
  name=$(echo "$ruta" | sed 's#[/?=&]#_#g; s#^_##'); [ -z "$name" ] && name=inicio
  "$lh/node_modules/.bin/lighthouse" "$base$ruta" --quiet \
    --chrome-flags="--headless=new --no-sandbox" \
    --only-categories=performance,accessibility,best-practices,seo \
    --output=json --output-path="$out/$name.json" >/dev/null 2>&1 || echo "FALLO $ruta"
  node -e '
    const r=require(process.argv[1]);const c=r.categories;
    const a=r.audits;
    console.log([process.argv[2].padEnd(48),"rend",Math.round(c.performance.score*100),"acc",Math.round(c.accessibility.score*100),"bp",Math.round(c["best-practices"].score*100),"seo",Math.round(c.seo.score*100),"LCP",a["largest-contentful-paint"].displayValue,"TBT",a["total-blocking-time"].displayValue,"CLS",a["cumulative-layout-shift"].displayValue].join(" "))' "$PWD/$out/$name.json" "$ruta"
done
