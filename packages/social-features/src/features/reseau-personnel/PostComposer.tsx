// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/PostComposer.tsx @ ad2e7fdc2 — adaptations : publication par `posts.posts.publish` du moteur et, au nom d'une PAGE du moteur (signataire vivant), par `pages.pages.publishAsPage` (identifiant `Id<"pages">`, audiences `public` / `followers` au lieu de la note de service `organisation`) ; groupe thématique `Id<"thematicGroups">` ; médias déposés par la garde des fichiers (`media.media.generateUploadUrl`, usage `media_social`) et déclarés avec leur identifiant de stockage TYPÉ ; réseau courant sur chaque appel (`useNetwork().networkId`) ; l'auteur du brouillon est la personne du moteur (`useNetwork().personId`) au lieu du handle lu par `getMyProfile`, et le magasin est configuré avec le préfixe du réseau (`configurePostDraftStorage(storagePrefix)`) ; libellés, compteur, alertes et toasts par l'i18n (clés `reseau:postComposer.*`, accords au nombre ; audiences et règles de `shared.ts` et `post-composer-target.ts` avec `t`) ; refus du moteur dit par son code (`postEngineErrorText`) ; borne du texte alternatif lue dans le domaine ; feuille de style sortie du JSX dans une constante de module (`COMPOSER_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface — règles inchangées.
"use client"

/**
 * Le composeur — texte, médias, audience.
 *
 * ⚠️ **Le brouillon ne vit plus ici** (R-12, 2026-09-06). Corps, audience,
 * audience de page, clé d'idempotence et médias sont dans
 * `post-draft-store.ts`, indexés par CIBLE (fil, groupe, page) et scopés par
 * RÉSEAU et par AUTEUR. La raison est simple : ce composant est démonté par
 * la fermeture de la feuille, par la bascule 959→960 (l'arbre entier est
 * remplacé) et par toute navigation — un `useState` y perdait tout, y compris
 * des téléversements déjà réussis.
 *
 * ⚠️ La clé d'idempotence est tirée à la NAISSANCE du brouillon, jamais à
 * l'envoi. Avec des médias téléversés AVANT la mutation, un renvoi après
 * expiration réseau publierait deux fois la même chose : c'est un piège déjà
 * payé ailleurs (`lib/chat/use-idempotency-key`, même règle). Elle n'est
 * renouvelée qu'après un SUCCÈS.
 *
 * L'audience est un CHOIX EXPLICITE, et le défaut est le plus restreint
 * (`shared.DEFAULT_AUDIENCE`) : se tromper vers le restreint est sans
 * conséquence, se tromper vers le public ne se rattrape pas.
 *
 * ⚠️ Un média dont le fichier n'est plus en mémoire (rechargement) et qui n'a
 * pas été téléversé est annoncé « à resélectionner » et BLOQUE l'envoi : on ne
 * présente pas un nom de fichier comme une pièce sauvegardée.
 */

import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { POST_MEDIA_ALT_MAX_LENGTH } from "@antsia/social-domain/content"
import { LEGACY_ROOT_NETWORK_SLUG, ROOT_NETWORK_SLUG } from "@antsia/social-domain/network"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { GABON_PROVINCES, PROVINCE_SLUGS, isProvinceSlug } from "@antsia/social-domain/provinces"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  Alert,
  Button,
  Card,
  Icon,
  Select,
  TextArea,
  TextInput,
} from "@antsia/ui"
import { useMutation } from "convex/react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Avatar } from "./Avatar"
import { postEngineErrorText } from "./post-overflow"
import {
  AUDIENCE_OPTIONS,
  PAGE_AUDIENCE_OPTIONS,
  type PageAudience,
  POST_MAX_LENGTH,
  evaluateComposer,
  type ReachAudience,
} from "./shared"
import {
  RESEAU_CARD_STYLE,
  RESEAU_FIELD_STYLE,
  RESEAU_PRIMARY_ACTION_STYLE,
  RESEAU_SECONDARY_ACTION_STYLE,
} from "../../shell/design-styles"
import {
  composerAudienceNote,
  composerDisclaimer,
  composerHeadingLabel,
  composerSubmitLabel,
  isComposerExpanded,
  resolveComposerTarget,
  showsAudienceSelector,
} from "./post-composer-target"
import { MEDIA_ACCEPT, useMediaDraft } from "./useMediaDraft"
import {
  newIdempotencyKey,
  postDraftKey,
  type PostDraftTarget,
} from "./post-draft"
import { configurePostDraftStorage, postDraftStore, usePostDraft } from "./post-draft-store"

interface PostComposerProps {
  /**
   * Monté dans un GROUPE thématique : la publication part avec l'audience
   * `group` et le sélecteur d'audience disparaît — l'audience vient du LIEU,
   * elle ne se choisit pas. Absent : composeur du fil, inchangé.
   */
  group?: { groupId: Id<"thematicGroups">; name: string }
  /**
   * Monté sur une PAGE dont la personne est signataire : la publication part
   * au nom de la PAGE (`pages.pages.publishAsPage`) et non du fil personnel,
   * le sélecteur d'audience change de LISTE — une page choisit entre le
   * communiqué (`public`) et la note à ses abonnés (`followers`), jamais
   * « mes connexions », qu'elle n'a pas — et l'avatar montré est celui de la
   * page. **Mutuellement exclusif avec `group`** — les fournir tous les deux
   * est une erreur de programmation, cf. `resolveComposerTarget`. Absent :
   * composeur du fil, inchangé.
   */
  asPage?: {
    pageId: Id<"pages">
    displayName: string
    avatarUrl: string | null
  }
  /**
   * Poser le focus sur la zone de texte au montage.
   *
   * ⚠️ `false` par défaut, et ce défaut n'est pas négociable : sur le fil, le
   * composeur est monté EN PERMANENCE. Y voler le focus à chaque rendu
   * ramènerait la page en haut et ouvrirait le clavier sans qu'on ait rien
   * demandé. Seule une surface OUVERTE PAR UN GESTE (la feuille mobile) a le
   * droit de le réclamer — c'est alors la conduite attendue d'une modale.
   */
  autoFocus?: boolean
  /**
   * Appelé APRÈS une publication réussie, jamais sur échec ni sur annulation.
   *
   * Sert à la surface qui enveloppe le composeur (feuille mobile) pour se
   * refermer d'elle-même. Le composeur, lui, se vide comme avant : ce rappel
   * s'ajoute à son comportement, il ne le remplace pas.
   */
  onPublished?: () => void
}

/**
 * La feuille du composeur, hors du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface (cliquet `no-hardcoded-strings`).
 */
const COMPOSER_CSS = `
          /* UNE seule rangée : « Photo ou vidéo », l'audience, le compteur
             et « Publier ». Sans nowrap, le sélecteur d'audience passait à la
             ligne dès que la carte se resserrait, et le composeur occupait
             trois hauteurs pour quatre contrôles.
             (Aucun accent grave dans ce bloc : il fermerait le littéral.) */
          .rp-composer-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: nowrap;
            min-width: 0;
          }
          .rp-composer-audience {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
            color: var(--ink-600);
            font-size: 12px;
          }
          /* C'est l'audience qui cède la place, jamais les deux boutons. */
          .rp-composer-audience > span:nth-of-type(2) { min-width: 0; }
          .rp-composer-submit {
            margin-left: auto;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            flex: 0 0 auto;
          }
          .rp-composer-controls > div:first-child { flex: 0 0 auto; }
          @container rp-composer (max-width: 560px) {
            /* Le compteur est le premier à disparaître : son information est
               déjà portée par le refus du bouton et par la zone aria-live. */
            .rp-composer-counter { display: none; }
          }
          @container rp-composer (max-width: 420px) {
            .rp-composer-controls { flex-wrap: wrap; }
            .rp-composer-submit { margin-left: 0; }
          }
        `

const publicationSchema = z.object({ alsoOnRoot: z.boolean(), province: z.union([z.literal(""), z.enum(PROVINCE_SLUGS)]) })

export function PostComposer({
  group,
  asPage,
  autoFocus = false,
  onPublished,
}: PostComposerProps = {}) {
  const { t } = useTranslation("reseau")
  const { networkId, personId, storagePrefix, slug } = useNetwork()
  // ── Erreur de PROGRAMMATION, traitée explicitement : un composeur ne
  // publie jamais à la fois dans un groupe et au nom d'une page. Avant tout
  // hook, pour que l'échec soit le même à chaque rendu (cf. en-tête du
  // module `post-composer-target.ts`).
  const target = resolveComposerTarget({
    group: group ? { name: group.name } : undefined,
    asPage: asPage ? { displayName: asPage.displayName } : undefined,
  })

  /**
   * La CIBLE du brouillon — le LIEU de publication, pas son libellé.
   *
   * Distincte de `target` (`ComposerTarget`, qui porte les noms affichés) :
   * celle-ci porte les IDENTIFIANTS, et c'est d'eux que dépend la clé du
   * brouillon. Deux groupes différents n'ont jamais le même brouillon.
   */
  const draftTarget: PostDraftTarget = group
    ? { kind: "group", groupId: group.groupId }
    : asPage
      ? { kind: "page", pageId: asPage.pageId }
      : { kind: "feed" }
  const draftKey = postDraftKey(draftTarget)

  /**
   * Le RÉSEAU et l'AUTEUR — la clé de persistance du brouillon en dépend.
   *
   * L'auteur est la personne de la session (`useNetwork().personId`), connue
   * dès le montage : aucun brouillon ne doit être relu — donc publié — sous
   * une autre identité, ni dans un autre réseau. Le préfixe du réseau est
   * posé ici aussi (idempotent) : le composeur ne dépend pas de l'ordre de
   * montage de la coque.
   */
  useEffect(() => {
    configurePostDraftStorage(storagePrefix)
    postDraftStore.setScope(personId)
  }, [storagePrefix, personId])

  // ⚠️ La graine ne sert QUE si la cible n'a pas encore de brouillon : elle est
  // tirée une fois par montage, pas à chaque rendu — sans quoi la clé
  // d'idempotence changerait à chaque frappe.
  const [seedKey] = useState(newIdempotencyKey)
  const draft = usePostDraft(draftKey, seedKey)
  const { body, audience, pageAudience, idempotencyKey } = draft
  const isRoot = slug === ROOT_NETWORK_SLUG || slug === LEGACY_ROOT_NETWORK_SLUG
  const canOpenPublic = !group && (!asPage || isRoot) && (asPage ? pageAudience : audience) === "public"
  const publicationId = useId()
  const publicationForm = useForm<z.infer<typeof publicationSchema>>({
    resolver: zodResolver(publicationSchema),
    values: { alsoOnRoot: canOpenPublic && draft.alsoOnRoot === true, province: isRoot && draft.province ? draft.province : "" },
  })
  const previousTarget = useRef(draftKey)
  useEffect(() => {
    if (!canOpenPublic || previousTarget.current !== draftKey) postDraftStore.setPublication(draftKey, { alsoOnRoot: false, province: draft.province })
    previousTarget.current = draftKey
  }, [canOpenPublic, draftKey, draft.province])
  const contextKey = `${networkId}:${personId}:${draftKey}`
  const currentContext = useRef(contextKey)
  currentContext.current = contextKey
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])

  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const media = useMediaDraft(draftTarget)

  const expanded = isComposerExpanded({
    focused,
    bodyLength: body.length,
    mediaCount: media.items.length,
  })
  const publish = useMutation(api.modules.posts.posts.publish)
  // Publier AU NOM d'une page : point d'écriture séparé — jamais de repli
  // vers `publish`, une page ne publie pas « en son nom propre » sur le fil
  // personnel de sa signataire.
  const publishAsPage = useMutation(api.modules.pages.pages.publishAsPage)
  const generateUploadUrl = useMutation(api.modules.media.media.generateUploadUrl)

  // Une publication portée par un média n'a pas besoin de texte.
  const state = evaluateComposer(body, submitting, t)
  /**
   * Ce qu'on ne peut plus envoyer : un média dont le fichier a quitté la
   * mémoire et qui n'a jamais été téléversé. On le DIT, et on bloque — publier
   * en silence sans lui trahirait ce que l'écran montre.
   */
  const aReselectionner = media.unrecoverable
  const canSubmit =
    !submitting &&
    aReselectionner.length === 0 &&
    state.remaining >= 0 &&
    (state.canSubmit || media.items.length > 0)
  /**
   * Ce que le choix OUVRE, dit en clair — et lu dans la BONNE liste. Le
   * chercher dans `AUDIENCE_OPTIONS` avec une valeur de page rendrait
   * `undefined`, donc une aide vide : l'écran cesserait d'expliquer
   * précisément là où l'enjeu est le plus grand.
   */
  const hintKey = asPage
    ? PAGE_AUDIENCE_OPTIONS.find((option) => option.value === pageAudience)
        ?.hintKey
    : AUDIENCE_OPTIONS.find((option) => option.value === audience)?.hintKey
  const hint = hintKey === undefined ? undefined : t(hintKey)

  const handleSubmit = publicationForm.handleSubmit(async (publication) => {
    if (!canSubmit) return
    if (postDraftStore.scope() !== personId || postDraftStore.storagePrefix() !== storagePrefix) return
    const submittedContext = contextKey
    setSubmitting(true)
    try {
      // Le dépôt passe par la garde des fichiers : une URL par média, pour
      // l'usage des publications.
      const uploaded = await media.upload(() =>
        generateUploadUrl({ networkId, usage: "media_social" })
      )
      const mediaArg = uploaded.length > 0 ? { media: uploaded } : {}
      if (!active.current || submittedContext !== currentContext.current) return
      const chosenPublication = {
        ...(canOpenPublic && publication.alsoOnRoot ? { alsoOnRoot: true } : {}),
        ...(isRoot && !group && isProvinceSlug(publication.province) ? { province: publication.province } : {}),
      }
      if (asPage) {
        await publishAsPage({
          networkId,
          pageId: asPage.pageId,
          body: body.trim(),
          audience: pageAudience,
          ...mediaArg,
          idempotencyKey,
          ...chosenPublication,
        })
      } else {
        await publish({
          networkId,
          body: body.trim(),
          // L'audience du LIEU : dans un groupe, `group` + son identifiant —
          // l'invariant `groupId` ⟺ audience `group` est tenu par le serveur.
          ...(group
            ? { audience: "group" as const, groupId: group.groupId }
            : { audience }),
          ...mediaArg,
          idempotencyKey,
          ...chosenPublication,
        })
      }
      // Vidage au SEUL succès : corps, médias, aperçus révoqués — et clé
      // d'idempotence NEUVE. Un échec ne passe jamais par ici, c'est ce qui
      // rend le renvoi sûr.
      if (!active.current || submittedContext !== currentContext.current) return
      postDraftStore.clear(draftKey)
      toast.success(t("postComposer.toast.published"))
      // APRÈS le nettoyage : la surface qui se referme démonte ce composeur,
      // et l'appeler avant laisserait un état à moitié remis à zéro derrière.
      onPublished?.()
    } catch (error) {
      // La clé n'est PAS renouvelée sur échec : c'est ce qui rend le renvoi
      // sûr — le serveur reconnaîtra le rejeu au lieu de publier deux fois.
      if (active.current && submittedContext === currentContext.current) toast.error(postEngineErrorText(error, "reseau:postComposer.toast.failed", t))
    } finally {
      if (active.current) setSubmitting(false)
    }
  })

  if (postDraftStore.scope() !== personId || postDraftStore.storagePrefix() !== storagePrefix) return null

  return (
    <Card
      style={{
        ...RESEAU_CARD_STYLE,
        // Conteneur propre au composeur : en trois colonnes, sa largeur
        // réelle (~512 px) n'a rien à voir avec celle de la PAGE (rp-page,
        // jusqu'à 1080 px) que ses @container lisaient jusqu'ici — le
        // compteur restait affiché bien après avoir manqué de place, et
        // débordait de sa rangée en `flex-wrap: nowrap`.
        containerType: "inline-size",
        containerName: "rp-composer",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <style href="rp-composer" precedence="default">{COMPOSER_CSS}</style>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {asPage ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar
                displayName={asPage.displayName}
                avatarUrl={asPage.avatarUrl}
                size={28}
                shape="square"
              />
              <label
                htmlFor="reseau-composer"
                style={{
                  color: "var(--ink-900)",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {composerHeadingLabel(target, t)}
              </label>
            </div>
          ) : (
            // Le titre ne s'AFFICHE plus sur le fil : la zone de saisie et son
            // texte d'invite disent déjà ce qu'on y fait, et le composeur ouvre
            // la page — il ne doit pas la remplir. L'étiquette demeure pour
            // l'accessibilité : c'est le nom accessible de la zone de saisie,
            // le retirer laisserait un champ anonyme au lecteur d'écran.
            <label htmlFor="reseau-composer" className="sr-only">
              {composerHeadingLabel(target, t)}
            </label>
          )}
          <TextArea
            id="reseau-composer"
            rows={expanded ? 3 : 1}
            autoFocus={autoFocus}
            onFocus={() => setFocused(true)}
            value={body}
            // Marge au-delà de la borne : couper la saisie à l'exact empêche de
            // voir son dépassement pour le corriger.
            maxLength={POST_MAX_LENGTH + 200}
            onChange={(event) =>
              postDraftStore.setBody(draftKey, event.target.value)
            }
            placeholder={t("postComposer.placeholder")}
            style={{
              ...RESEAU_FIELD_STYLE,
              // Repliée tant qu'on n'écrit pas, elle s'ouvre dès la première
              // frappe ou au focus. La transition porte sur `min-height`
              // seule, et se tait sous `prefers-reduced-motion`.
              minHeight: expanded ? "var(--esp-textarea-min-height, 84px)" : 44,
              fontSize: "var(--esp-field-font-size, inherit)",
              lineHeight: "var(--esp-field-line-height, inherit)",
              padding: expanded ? "12px 13px" : "10px 13px",
              transition: "min-height 150ms ease-out",
            }}
          />
          {expanded ? (
            <p
              style={{
                margin: 0,
                color: "var(--ink-500)",
                fontSize: 11.5,
                lineHeight: 1.5,
              }}
            >
              {composerDisclaimer(target, t)}
            </p>
          ) : null}
        </div>

        {media.rejection ? (
          <Alert tone="warning">{media.rejection}</Alert>
        ) : null}

        {/* Le brouillon a survécu au rechargement, ces fichiers non. Le dire
            AVANT l'envoi, et bloquer : un nom conservé n'est pas une pièce
            sauvegardée (PLAN §5 lot 04, item 3). */}
        {aReselectionner.length > 0 ? (
          <Alert tone="warning">
            {aReselectionner.length === 1
              ? t("postComposer.reselectOne", { name: aReselectionner[0]?.fileName ?? "" })
              : t("postComposer.reselectMany", { count: aReselectionner.length })}
          </Alert>
        ) : null}

        {media.items.length > 0 ? (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            {media.items.map((item) => (
              <li
                key={item.localId}
                style={{
                  border: "1px solid var(--ink-200)",
                  borderRadius: "var(--esp-primitive-card-radius, 8px)",
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ position: "relative" }}>
                  {item.previewUrl === null ? (
                    /* Plus d'aperçu : le fichier n'est plus en mémoire. On
                       montre une PLACE, pas une image morte — et le nom, qui
                       est tout ce qui reste. */
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "4 / 3",
                        borderRadius: "var(--esp-primitive-media-radius, 6px)",
                        display: "grid",
                        placeItems: "center",
                        padding: 8,
                        textAlign: "center",
                        fontSize: 12,
                        color: "var(--ink-600)",
                        background: "var(--ink-100)",
                      }}
                    >
                      {item.upload.status === "uploaded"
                        ? t("postComposer.tileUploaded", { name: item.fileName })
                        : t("postComposer.tileReselect", { name: item.fileName })}
                    </div>
                  ) : item.kind === "image" ? (
                    <img
                      src={item.previewUrl}
                      alt=""
                      style={{
                        width: "100%",
                        aspectRatio: "4 / 3",
                        objectFit: "cover",
                        borderRadius: "var(--esp-primitive-media-radius, 6px)",
                        display: "block",
                        background: "var(--ink-100)",
                      }}
                    />
                  ) : (
                    <video
                      src={item.previewUrl}
                      style={{
                        width: "100%",
                        aspectRatio: "4 / 3",
                        borderRadius: "var(--esp-primitive-media-radius, 6px)",
                        display: "block",
                        background: "var(--ink-900)",
                      }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => media.remove(item.localId)}
                    aria-label={t("postComposer.removeMedia", { name: item.fileName })}
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      width: "var(--esp-control-min-size, 28px)",
                      height: "var(--esp-control-min-size, 28px)",
                      borderRadius: "var(--esp-primitive-button-radius, 14px)",
                      border: "none",
                      background: "var(--esp-action-danger-fill, var(--ink-900))",
                      color: "var(--esp-action-danger-on, var(--ink-0))",
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
                {/* Le texte alternatif n'est pas un détail : sans lui, la
                    publication est muette pour qui utilise un lecteur d'écran. */}
                <TextInput
                  value={item.altText}
                  maxLength={POST_MEDIA_ALT_MAX_LENGTH}
                  onChange={(event) =>
                    media.setAltText(item.localId, event.target.value)
                  }
                  placeholder={t("postComposer.altPlaceholder")}
                  aria-label={t("postComposer.altLabel", { name: item.fileName })}
                  style={{ fontSize: 13 }}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {!group ? <fieldset disabled={submitting} className="flex min-w-0 flex-col gap-[var(--esp-card-gap,0.75rem)] rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-border p-[var(--esp-card-padding,0.75rem)]">
          <legend className="px-1 text-sm font-medium">{t("postComposer.publication.legend")}</legend>
          {canOpenPublic ? <label htmlFor={`${publicationId}-public`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--esp-primitive-chip-radius,0.5rem)] px-2 text-sm focus-within:ring-2 focus-within:ring-ring">
            <input id={`${publicationId}-public`} type="checkbox" aria-describedby={`${publicationId}-hint`} {...publicationForm.register("alsoOnRoot", { onChange: (event) => postDraftStore.setPublication(draftKey, { alsoOnRoot: event.target.checked === true, province: draft.province }) })} />
            <span>{t(isRoot ? "postComposer.publication.withoutAccount" : "postComposer.publication.alsoOnRoot", { brand: BRAND_NAME })}</span>
          </label> : null}
          <p id={`${publicationId}-hint`} role="status" className="text-xs text-muted-foreground">{t(asPage && !isRoot ? "postComposer.publication.pagePolicyHint" : canOpenPublic && draft.alsoOnRoot ? "postComposer.publication.publicHint" : "postComposer.publication.memberHint", { brand: BRAND_NAME })}</p>
          {isRoot ? <label htmlFor={`${publicationId}-province`} className="flex flex-col gap-1.5 text-sm"><span>{t("postComposer.publication.provinceLabel")}</span>
            <select id={`${publicationId}-province`} aria-describedby={`${publicationId}-province-hint`} className="min-h-11 w-full rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...publicationForm.register("province", { onChange: (event) => postDraftStore.setPublication(draftKey, { alsoOnRoot: canOpenPublic && draft.alsoOnRoot === true, ...(isProvinceSlug(event.target.value) ? { province: event.target.value } : {}) }) })}>
              <option value="">{t("postComposer.publication.noProvince")}</option>{GABON_PROVINCES.map((province) => <option key={province.slug} value={province.slug}>{province.name}</option>)}
            </select><span id={`${publicationId}-province-hint`} className="text-xs text-muted-foreground">{t("postComposer.publication.provinceHint")}</span>
          </label> : null}
        </fieldset> : null}

        <div className="rp-composer-controls">
          <div>
            <input
              ref={fileInput}
              type="file"
              accept={MEDIA_ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                media.add(Array.from(event.target.files ?? []))
                // Réinitialisé pour que re-choisir LE MÊME fichier déclenche
                // encore un changement.
                event.target.value = ""
              }}
            />
            <Button
              variant="secondary"
              type="button"
              onClick={() => fileInput.current?.click()}
              style={RESEAU_SECONDARY_ACTION_STYLE}
            >
              {t("postComposer.addMedia")}
            </Button>
          </div>

          {showsAudienceSelector(target) ? (
            <label
              htmlFor="reseau-audience"
              className="rp-composer-audience"
              title={hint}
            >
              <span>{t("postComposer.audienceLabel")}</span>
              <span style={{ minWidth: 170 }}>
                <Select
                  id="reseau-audience"
                  value={asPage ? pageAudience : audience}
                  aria-describedby="reseau-audience-hint"
                  style={{
                    borderRadius: "var(--esp-input-radius, 10px)",
                    border: "1px solid var(--ink-300)",
                    minHeight: 44,
                    paddingBlock: 8,
                    fontSize: 12.5,
                  }}
                  onChange={(event) => {
                    if (asPage) {
                      postDraftStore.setPageAudience(
                        draftKey,
                        event.target.value as PageAudience,
                      )
                      return
                    }
                    postDraftStore.setAudience(
                      draftKey,
                      event.target.value as ReachAudience,
                    )
                  }}
                >
                  {(asPage ? PAGE_AUDIENCE_OPTIONS : AUDIENCE_OPTIONS).map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ),
                  )}
                </Select>
              </span>
              <span id="reseau-audience-hint" className="sr-only">
                {hint}
              </span>
            </label>
          ) : (
            // Pas de sélecteur : l'audience est celle du LIEU (un groupe).
            // L'écran le dit plutôt que d'offrir un choix qui n'existe pas.
            <span className="rp-composer-audience">
              {composerAudienceNote(target, t)}
            </span>
          )}

          <div className="rp-composer-submit">
            <span
              aria-live="polite"
              className="rp-composer-counter"
              style={{
                fontSize: 11.5,
                fontVariantNumeric: "tabular-nums",
                fontFamily: "var(--font-mono)",
                // `--ink-500` et non `--ink-400` : ce dernier est le gris le
                // plus discret de l'échelle, réservé au NON-textuel — il
                // mesurait 2,33:1 en clair et 2,41:1 en sombre sous ce
                // compteur, dans les deux cas sous le seuil AA (corrigé le
                // 2026-08-20).
                color:
                  state.remaining < 0 ? "var(--danger-600)" : "var(--ink-500)",
              }}
            >
              {state.blockedReason ?? t("postComposer.remaining", { count: state.remaining })}
            </span>
            <Button
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              style={RESEAU_PRIMARY_ACTION_STYLE}
            >
              {composerSubmitLabel(target, submitting, t)}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
