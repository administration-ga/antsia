#!/usr/bin/env bash
# Déploiement Convex d'ANTSIA : démonstration puis production (marketplace MP00–MP14, ADR-0034).
#
# À lancer par le propriétaire, sur sa machine, avec ses clés de déploiement :
#
#   ANTSIA_CONVEX_DEMO_DEPLOY_KEY='…' ANTSIA_CONVEX_PROD_DEPLOY_KEY='…' \
#     bash scripts/convex-deploy-demo-production.sh [verifier|demo|graines|production|tout]
#
#   verifier    contrôles seulement (clés, cible, main, disque) : rien n'est déployé ;
#   demo        déploie la démonstration seule ;
#   graines     graines de la démonstration seules (comptes OTP, contenus, figurants, images) ;
#   production  déploie la production seule ;
#   tout        démonstration, graines de démo, pause de contrôle, puis production (défaut).
#
# Garde-fous :
# - le code vient d'un export propre de origin/main (jamais de l'arbre de travail partagé,
#   dont le .env.local désigne le backend local anonyme des autres sessions) ;
# - main doit contenir la marketplace : sinon le front publié ensuite appellerait des
#   fonctions absentes ;
# - chaque clé doit désigner le déploiement attendu, et chaque cible se confirme en
#   retapant son nom ;
# - les clés ne sont ni affichées, ni écrites dans un fichier.
#
# Le front (Vercel, enfant démo puis principal) se publie APRÈS ce script.
set -euo pipefail

DEMO_DEPLOYMENT="vivid-hedgehog-655"
PROD_DEPLOYMENT="diligent-avocet-585"
MARKETPLACE_MARKER="convex/modules/shops/marketplaceRead.ts"
MIN_FREE_MIB=3072

mode="${1:-tout}"
case "$mode" in verifier|demo|graines|production|tout) ;; *) echo "Mode inconnu : $mode (verifier, demo, graines, production ou tout)." >&2; exit 2 ;; esac

ANTSIA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ECOSYSTEMS="$(cd "$ANTSIA_DIR/.." && pwd)"
DIASPORALE_DIR="$ECOSYSTEMS/DIASPORALE"

fail() { echo "ARRÊT : $*" >&2; exit 1; }
step() { echo; echo "── $*"; }

# Le nom de déploiement porté par une clé « prod:<nom>|… », sans jamais afficher la clé.
deployment_of_key() { local key="$1"; local head="${key%%|*}"; echo "${head#*:}"; }

check_key() {
  local label="$1" var="$2" expected="$3"
  local key="${!var:-}"
  [ -n "$key" ] || fail "$var est vide : clé de $label manquante."
  [ "$(deployment_of_key "$key")" = "$expected" ] || fail "$var ne désigne pas $expected (clé de $label refusée)."
  echo "Clé de $label : désigne bien $expected."
}

step "Contrôles"
command -v git >/dev/null || fail "git introuvable."
command -v bun >/dev/null || fail "bun introuvable."
if [ "$mode" != "production" ]; then check_key "démonstration" ANTSIA_CONVEX_DEMO_DEPLOY_KEY "$DEMO_DEPLOYMENT"; fi
if [ "$mode" != "demo" ] && [ "$mode" != "graines" ]; then check_key "production" ANTSIA_CONVEX_PROD_DEPLOY_KEY "$PROD_DEPLOYMENT"; fi

git -C "$ANTSIA_DIR" fetch --quiet origin main
git -C "$DIASPORALE_DIR" fetch --quiet origin main
ANTSIA_REV="$(git -C "$ANTSIA_DIR" rev-parse origin/main)"
DIASPORALE_REV="$(git -C "$DIASPORALE_DIR" rev-parse origin/main)"
git -C "$ANTSIA_DIR" cat-file -e "origin/main:$MARKETPLACE_MARKER" 2>/dev/null \
  || fail "origin/main ($ANTSIA_REV) ne contient pas la marketplace : fusionner la PR 36 d'abord."
echo "Source : ANTSIA origin/main $ANTSIA_REV, DIASPORALE origin/main $DIASPORALE_REV."

free_mib="$(df -m "${TMPDIR:-/tmp}" | awk 'NR==2 {print $4}')"
[ "$free_mib" -ge "$MIN_FREE_MIB" ] || fail "seulement $free_mib Mio libres (il en faut $MIN_FREE_MIB pour l'installation)."
echo "Disque : $free_mib Mio libres."

if [ "$mode" = "verifier" ]; then echo; echo "Contrôles terminés : rien n'a été déployé."; exit 0; fi

step "Export propre et installation"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/antsia-convex-deploy.XXXXXX")"
cleanup() { rm -rf -- "${WORK:?}"; }
trap cleanup EXIT
mkdir -p "$WORK/ANTSIA" "$WORK/DIASPORALE"
git -C "$ANTSIA_DIR" archive "$ANTSIA_REV" | tar -x -C "$WORK/ANTSIA"
git -C "$DIASPORALE_DIR" archive "$DIASPORALE_REV" | tar -x -C "$WORK/DIASPORALE"
(cd "$WORK/ANTSIA" && bun install --frozen-lockfile)

deploy() {
  local label="$1" var="$2" expected="$3"
  step "Déploiement $label ($expected)"
  echo "Aperçu de la configuration envoyée (rien n'est encore déployé) :"
  (cd "$WORK/ANTSIA" && CONVEX_DEPLOY_KEY="${!var}" node scripts/convex-dev.mjs deploy --dry-run --typecheck disable)
  local answer
  read -r -p "Retapez « $expected » pour déployer $label : " answer
  [ "$answer" = "$expected" ] || fail "confirmation refusée : $label non déployée."
  (cd "$WORK/ANTSIA" && CONVEX_DEPLOY_KEY="${!var}" node scripts/convex-dev.mjs deploy --typecheck disable \
    --message "ANTSIA main ${ANTSIA_REV:0:12} — marketplace MP00–MP14")
  echo "$label : déployée depuis main ${ANTSIA_REV:0:12}."
}

if [ "$mode" = "demo" ] || [ "$mode" = "tout" ]; then
  deploy "la démonstration" ANTSIA_CONVEX_DEMO_DEPLOY_KEY "$DEMO_DEPLOYMENT"
fi

if [ "$mode" = "graines" ] || [ "$mode" = "tout" ]; then
  step "Graines de démonstration ($DEMO_DEPLOYMENT)"
  # Rejouables : rien n'est recréé, rien de retiré n'est republié ; la clé reste dans l'environnement.
  (cd "$WORK/ANTSIA" && node scripts/seed-demo-content.mjs)
fi

if [ "$mode" = "tout" ]; then
  step "Pause : contrôle de la démonstration"
  echo "Contrôlez la démo sur https://antsia.vercel.app/demo, puis appuyez sur Entrée pour passer à la production."
  read -r -p "Entrée pour continuer, Ctrl-C pour s'arrêter ici. " _
fi

if [ "$mode" = "production" ] || [ "$mode" = "tout" ]; then
  deploy "la production" ANTSIA_CONVEX_PROD_DEPLOY_KEY "$PROD_DEPLOYMENT"
fi

step "Terminé"
echo "Backend à jour sur main ${ANTSIA_REV:0:12}. Publier ensuite le front : enfant démo, puis principal."
echo "Retour arrière du front : promouvoir le déploiement Vercel précédent."
