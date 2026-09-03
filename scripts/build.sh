#!/usr/bin/env bash
#
# Monta o diretorio build/ que o Terraform empacota em ZIP
# (data.archive_file.lambda em infra/lambda.tf).
#
# Rode antes de qualquer terraform plan/apply, local ou na pipeline - sem o
# build/, o archive_file falha com "no such file or directory".
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$RAIZ/build"

echo "==> Limpando $BUILD"
rm -rf "$BUILD"
mkdir -p "$BUILD"

echo "==> Instalando dependencias de producao"
cd "$RAIZ"
# --omit=dev: nada de ferramenta de teste dentro do pacote da Lambda; cada MB
# a mais no ZIP e cold start a mais.
npm ci --omit=dev

echo "==> Copiando codigo e dependencias"
cp -R "$RAIZ/src" "$BUILD/src"
cp -R "$RAIZ/node_modules" "$BUILD/node_modules"
cp "$RAIZ/package.json" "$BUILD/package.json"

echo "==> Pronto: $(du -sh "$BUILD" | cut -f1) em $BUILD"
