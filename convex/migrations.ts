/**
 * Migrations de données du moteur (cahier §11 : `@convex-dev/migrations`,
 * répétées sur un instantané avant toute production). Chaque migration est
 * idempotente : rejouée, elle ne réécrit rien.
 *
 *   bunx convex run migrations:run '{"fn": "migrations:setPostsOnRoot"}'
 */
import { Migrations } from "@convex-dev/migrations"

import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import { directoryPlacePatch } from "./modules/diaspora/facts"

export const migrations = new Migrations<DataModel>(components.migrations)

/** Le lanceur générique (CLI, tableau de bord). */
export const run = migrations.runner()

/**
 * PA3 lot 7 — `posts.onRoot` pour les publications d'avant le champ : lisible
 * depuis la racine si elle y est née, ou si sa visibilité est `root`.
 */
export const setPostsOnRoot = migrations.define({
  table: "posts",
  migrateOne: async (ctx, post) => {
    if (post.onRoot !== undefined) return
    const network = await ctx.db.get(post.networkId)
    return { onRoot: network?.kind === "root" || post.visibility === "root" }
  },
})

/**
 * CH-816 P3 — le LIEU (pays, ville repliée) des lignes d'annuaire d'un réseau
 * gouverné par la tranche `diaspora`, pour les membres listés avant ces champs :
 * sans lui, le parcours par pays (`diaspora/directory.browseMembers`) ne les
 * trouverait pas. Rejoue LA règle de la tranche (`directoryPlacePatch`) : posé
 * pour qui a choisi de paraître, effacé sinon ; les lignes des autres réseaux ne
 * sont pas touchées. Idempotente et bornée (lots du composant) — la lancer en
 * ligne est un geste de publication :
 *
 *   bunx convex run migrations:run '{"fn": "migrations:backfillDirectoryPlaces"}'
 */
export const backfillDirectoryPlaces = migrations.define({
  table: "peopleDirectory",
  migrateOne: async (ctx, row) => await directoryPlacePatch(ctx, row),
})
