#!/usr/bin/env bash
# ./build.sh kernel   - rebuild app/worker/kernel.js + wasm and app/vendor/three.js from npm
# ./build.sh launcher - rebuild dist/Modeler.ex_ (Windows) from launcher/
set -e
cd "$(dirname "$0")"
what="${1:-launcher}"
if [ "$what" = "kernel" ] || [ "$what" = "all" ]; then
  tmp=$(mktemp -d)
  (cd "$tmp" && npm init -y >/dev/null && npm i replicad replicad-opencascadejs three esbuild >/dev/null)
  printf 'import opencascade from "replicad-opencascadejs";\nexport { opencascade };\nexport * from "replicad";\n' > "$tmp/k.js"
  printf 'export * from "three";\nexport { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";\n' > "$tmp/t.js"
  (cd "$tmp" && npx esbuild k.js --bundle --format=esm --platform=browser --minify --external:node:* --outfile=k.out.js && npx esbuild t.js --bundle --format=esm --minify --outfile=t.out.js)
  cp "$tmp/k.out.js" app/worker/kernel.js
  cp "$tmp/node_modules/replicad-opencascadejs/dist/replicad_single.wasm" app/worker/
  cp "$tmp/t.out.js" app/vendor/three.js
  rm -rf "$tmp"
fi
if [ "$what" = "launcher" ] || [ "$what" = "all" ]; then
  (cd launcher && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o ../dist/Modeler.ex_ .)
  grep -oP 'LauncherVersion = \K\d+' launcher/main.go > dist/launcher-version.txt
  echo "Built dist/Modeler.ex_ (launcher v$(cat dist/launcher-version.txt))"
fi
