/** Tag manuel du contenu livré, indépendant du HEAD et des autres travaux partagés. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const hash = createHash("sha256")
for (const name of ["Dockerfile", "entrypoint.sh", "server.mjs", "cloudbuild.yaml"]) {
  hash.update(name).update("\0").update(readFileSync(new URL(name, import.meta.url))).update("\0")
}
console.log(`manual-${hash.digest("hex").slice(0, 20)}`)
