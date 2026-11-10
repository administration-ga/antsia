// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/ProfilePublicationCard.tsx @ ad2e7fdc2 — adaptations : branchée sur la personne du moteur (`people.persons.getMyPerson`, sur soi) et ses gestes (`people.profile.{publishMyProfile, withdrawMyProfile, setMyProfilePrivacy, setMyAvatar, setMyCover}`) ; photo et couverture déposées par `people.profile.generateProfileUploadUrl({ usage })` puis posées avec leur type déclaré (garde des fichiers : une image neuve peut être RETENUE le temps de son analyse, ce que la carte et le toast disent) ; retrait de la couverture ajouté (la copie de visibilité promet que chaque image se retire comme elle s'ajoute) ; rien n'est publié d'office (invariant 7) — plus d'étape « adresse posée d'office » : l'identifiant se choisit DANS l'éditeur (`HandleChoiceCard` contrôlé, propositions à partir du nom saisi), et un profil retiré se republie sous son identifiant gardé ; « Reprendre la photo de mon compte » retiré avec la prop `accountAvatarUrl` (rien n'est repris du compte) ; refus du moteur par leurs codes (`profileErrorText` : règle, puis code, puis phrase) ; « votre poste reste joignable dans l'annuaire » retiré ; textes par l'i18n (`reseau:profilePublicationCard.*`) ; bornes des champs lues dans le domaine (`@antsia/social-domain/content`).
"use client"

/**
 * L'OPT-IN de visibilité — la carte qui publie MON profil de réseau, et qui
 * explique pourquoi on n'est pas trouvable tant qu'on ne l'a pas fait.
 *
 * Sans cette carte, l'absence de profil publié se manifesterait par un écran
 * qui « ne marche pas » : personne ne vous trouve, votre nom s'affiche
 * neutre, et rien ne dit pourquoi. C'est un choix, il doit se lire comme un
 * choix.
 *
 * Rien n'est publié d'office (invariant 7), et rien n'est repris du compte de
 * connexion : ni nom, ni photo. L'éditeur part de ce que la personne a
 * elle-même publié — et de rien la première fois. Le proposer d'un clic ferait
 * du choix une formalité.
 *
 * Ce qui reste du recours, une fois publié :
 *   - le mode privé (« hors connexion ») : hors des recherches et des
 *     suggestions, sans rompre ses relations ;
 *   - le retrait, plus radical : il rend le nom neutre partout, sans rien
 *     effacer — l'identifiant reste réservé, republier rétablit.
 */

import { themedActionStyle } from "../themed-action-style"
import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import type { MediaWithheld } from "@antsia/social-contracts/media"
import {
  DISPLAY_NAME_MAX_LENGTH,
  HEADLINE_MAX_LENGTH,
} from "@antsia/social-domain/content"
import { Alert, Button, Card, Field, TextInput } from "@antsia/ui"
import { useMutation } from "convex/react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Avatar } from "./Avatar"
import { HandleChoiceCard } from "./HandleChoiceCard"
import { profileErrorText } from "./profil-personne"
import { profileOnboardingStep } from "./profile-onboarding"
import { useProfileOnboardingAccount } from "./use-profile-onboarding"
import {
  RESEAU_CARD_STYLE,
  RESEAU_PRIMARY_ACTION_STYLE,
  RESEAU_SECONDARY_ACTION_STYLE,
} from "../../shell/design-styles"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import {
  AVATAR_ACCEPT,
  avatarRejectionFor,
  HANDLE_MAX_LENGTH,
  validateHandle,
} from "./shared"

/** Les deux images d'un profil, chacune sous sa politique de dépôt. */
type ProfileImageUsage = "avatar" | "cover"

/** Ce que rend la pose d'une image : son URL servie, ou sa retenue. */
interface ProfileImageDelivery {
  url: string | null
  withheld: MediaWithheld | null
}

export function ProfilePublicationCard() {
  const { t } = useTranslation("reseau")
  const profile = useAuthenticatedConvexQuery(
    api.modules.people.persons.getMyPerson,
    {},
  )
  // La personne peut manquer à la première session : ce hook la crée et dit
  // si la création court — l'étape en dépend. Il ne publie rien.
  const onboardingAccount = useProfileOnboardingAccount()
  const onboardingStep = profileOnboardingStep(profile.data, onboardingAccount)
  const publish = useMutation(api.modules.people.profile.publishMyProfile)
  const withdraw = useMutation(api.modules.people.profile.withdrawMyProfile)
  const setPrivacy = useMutation(api.modules.people.profile.setMyProfilePrivacy)
  const setMyAvatar = useMutation(api.modules.people.profile.setMyAvatar)
  const setMyCover = useMutation(api.modules.people.profile.setMyCover)
  const generateUploadUrl = useMutation(
    api.modules.people.profile.generateProfileUploadUrl,
  )
  const avatarInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)

  /**
   * Dépose le blob sous la politique de son usage. Deux temps, parce que le
   * blob doit exister avant que le serveur puisse en relire les métadonnées
   * RÉELLES — c'est sur elles qu'il juge, jamais sur ce que le navigateur
   * déclare.
   */
  const uploadImage = async (
    file: Blob,
    usage: ProfileImageUsage,
  ): Promise<Id<"_storage">> => {
    const url = await generateUploadUrl({ usage })
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    })
    if (!response.ok) throw new Error("upload")
    const { storageId } = (await response.json()) as {
      storageId: Id<"_storage">
    }
    return storageId
  }

  /**
   * Ce que la pose d'une image produit À L'ÉCRAN : servie tout de suite, ou
   * retenue par l'analyse (elle apparaîtra ensuite), ou bloquée.
   */
  const announceDelivery = (
    delivery: ProfileImageDelivery,
    usage: ProfileImageUsage,
  ) => {
    if (delivery.withheld === "fileQuarantined" || delivery.withheld === "fileScanUnavailable") {
      toast.error(t(`errors:${delivery.withheld}`))
      return
    }
    if (delivery.withheld === "fileScanPending") {
      toast.success(t(`profilePublicationCard.toast.${usage}Pending`))
      return
    }
    toast.success(t(`profilePublicationCard.toast.${usage}Updated`))
  }

  const handleImageFile = async (file: File, usage: ProfileImageUsage) => {
    const refusal = avatarRejectionFor(file, t)
    if (refusal) {
      toast.error(refusal)
      return
    }
    const setUploading = usage === "avatar" ? setUploadingAvatar : setUploadingCover
    setUploading(true)
    try {
      const storageId = await uploadImage(file, usage)
      const place = usage === "avatar" ? setMyAvatar : setMyCover
      const delivery = await place({
        storageId,
        ...(file.type ? { mimeType: file.type } : {}),
      })
      announceDelivery(delivery, usage)
    } catch (err) {
      toast.error(
        profileErrorText(err, `reseau:profilePublicationCard.toast.${usage}Failed`, t),
      )
    } finally {
      setUploading(false)
    }
  }

  const removeImage = (usage: ProfileImageUsage) => {
    const place = usage === "avatar" ? setMyAvatar : setMyCover
    void place({ storageId: null })
      .then(() => toast.success(t(`profilePublicationCard.toast.${usage}Removed`)))
      .catch((err: unknown) =>
        toast.error(
          profileErrorText(err, "reseau:profilePublicationCard.toast.removeFailed", t),
        ),
      )
  }

  const [editing, setEditing] = useState(false)
  const [handle, setHandle] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [headline, setHeadline] = useState("")
  const [saving, setSaving] = useState(false)

  const handleError = editing ? validateHandle(handle, t) : null
  const nameError =
    editing && displayName.trim().length === 0
      ? t("profilePublicationCard.editor.nameRequired")
      : null

  /**
   * L'éditeur part de ce que la personne a elle-même PUBLIÉ (ou gardé après
   * un retrait) — jamais d'un nom de compte : la première fois, il est vide.
   */
  const openEditor = () => {
    setHandle(profile.data?.handle ?? "")
    setDisplayName(profile.data?.displayName ?? "")
    setHeadline(profile.data?.headline ?? "")
    setEditing(true)
  }

  const handleSave = async () => {
    if (handleError || nameError) return
    setSaving(true)
    try {
      await publish({
        handle: handle.trim().toLowerCase(),
        displayName: displayName.trim(),
        ...(headline.trim().length > 0 ? { headline: headline.trim() } : {}),
      })
      setEditing(false)
      toast.success(t("profilePublicationCard.toast.published"))
    } catch (err) {
      // Le refus le plus probable est un identifiant déjà pris : le serveur
      // seul le sait, et il le dit par son code.
      toast.error(
        profileErrorText(err, "reseau:profilePublicationCard.toast.publishFailed", t),
      )
    } finally {
      setSaving(false)
    }
  }

  if (profile.isLoading) {
    return (
      <Card style={RESEAU_CARD_STYLE}>
        <p style={{ margin: 0, color: "var(--ink-600)" }}>
          {t("profilePublicationCard.loading")}
        </p>
      </Card>
    )
  }

  if (profile.isError) {
    return (
      <ReseauQueryError
        title={t("profilePublicationCard.error.title")}
        message={t("profilePublicationCard.error.message")}
        onRetry={() => void profile.refetch()}
      />
    )
  }

  if (editing) {
    return (
      <Card style={RESEAU_CARD_STYLE}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, color: "var(--ink-900)" }}>
            {t("profilePublicationCard.editor.title")}
          </h2>
          {/* Le nom d'abord : les propositions d'identifiant en partent. */}
          <Field
            label={t("profilePublicationCard.editor.nameLabel")}
            hint={t("profilePublicationCard.editor.nameHint")}
            error={nameError}
            htmlFor="reseau-nom"
          >
            <TextInput
              id="reseau-nom"
              value={displayName}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <Field
            label={t("profilePublicationCard.editor.handleLabel")}
            hint={t("profilePublicationCard.editor.handleHint")}
            error={handleError}
            htmlFor="reseau-handle"
          >
            <TextInput
              id="reseau-handle"
              value={handle}
              maxLength={HANDLE_MAX_LENGTH}
              onChange={(event) => setHandle(event.target.value)}
              placeholder={t("profilePublicationCard.editor.handlePlaceholder")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <HandleChoiceCard
            displayName={displayName}
            value={handle}
            onChoose={setHandle}
            currentHandle={profile.data?.handle ?? null}
          />
          <Field
            label={t("profilePublicationCard.editor.headlineLabel")}
            hint={t("profilePublicationCard.editor.headlineHint")}
            htmlFor="reseau-accroche"
          >
            <TextInput
              id="reseau-accroche"
              value={headline}
              maxLength={HEADLINE_MAX_LENGTH}
              onChange={(event) => setHeadline(event.target.value)}
              placeholder={t("profilePublicationCard.editor.headlinePlaceholder")}
            />
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button
              variant="outline"
              onClick={() => setEditing(false)}
              style={themedActionStyle("cancel", "ghost", RESEAU_SECONDARY_ACTION_STYLE)}
            >
              {t("profilePublicationCard.editor.cancel")}
            </Button>
            <Button
              disabled={saving || Boolean(handleError) || Boolean(nameError)}
              onClick={() => void handleSave()}
              style={RESEAU_PRIMARY_ACTION_STYLE}
            >
              {saving
                ? t("profilePublicationCard.editor.publishing")
                : t("profilePublicationCard.editor.publish")}
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  const person = profile.data
  if (!person || !person.published || !person.handle || !person.displayName) {
    // La personne est en cours de création : le profil arrive, on n'annonce
    // pas un manque de deux secondes.
    if (onboardingStep.kind !== "publish") return null
    // Un profil RETIRÉ garde son identifiant : il se republie, il ne se
    // recrée pas.
    const retired = person !== null && person !== undefined && Boolean(person.handle)
    return (
      <Card style={RESEAU_CARD_STYLE}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Alert
            tone="info"
            title={
              retired
                ? t("profilePublicationCard.retired.title")
                : t("profilePublicationCard.unpublished.title")
            }
          >
            {retired
              ? t("profilePublicationCard.retired.body")
              : t("profilePublicationCard.unpublished.body")}
          </Alert>
          <div>
            <Button
              icon="userPlus"
              onClick={openEditor}
              style={RESEAU_PRIMARY_ACTION_STYLE}
            >
              {retired
                ? t("profilePublicationCard.retired.action")
                : t("profilePublicationCard.unpublished.action")}
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  const avatarWithheld = person.avatar?.withheld ?? null
  const coverWithheld = person.cover?.withheld ?? null

  return (
    <Card style={RESEAU_CARD_STYLE}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Avatar
            displayName={person.displayName}
            avatarUrl={person.avatar?.url ?? null}
            size={56}
          />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, color: "var(--ink-900)" }}>
              {person.displayName}
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-600)" }}>
              @{person.handle}
              {person.headline ? ` · ${person.headline}` : ""}
            </p>
          </div>
        </div>

        {/* Une image retenue par l'analyse n'est pas une image perdue : la
            carte le dit, au lieu d'un médaillon vide sans explication. */}
        {avatarWithheld !== null ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-600)" }}>
            {avatarWithheld === "fileScanUnavailable"
              ? t("errors:fileScanUnavailable")
              : avatarWithheld === "fileScanPending"
              ? t("profilePublicationCard.withheld.avatarPending")
              : t("profilePublicationCard.withheld.avatarBlocked")}
          </p>
        ) : null}
        {coverWithheld !== null ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-600)" }}>
            {coverWithheld === "fileScanUnavailable"
              ? t("errors:fileScanUnavailable")
              : coverWithheld === "fileScanPending"
              ? t("profilePublicationCard.withheld.coverPending")
              : t("profilePublicationCard.withheld.coverBlocked")}
          </p>
        ) : null}

        <input
          ref={avatarInput}
          type="file"
          accept={AVATAR_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleImageFile(file, "avatar")
            event.target.value = ""
          }}
        />
        <input
          ref={coverInput}
          type="file"
          accept={AVATAR_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleImageFile(file, "cover")
            event.target.value = ""
          }}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            size="sm"
            icon="camera"
            disabled={uploadingAvatar}
            onClick={() => avatarInput.current?.click()}
            style={RESEAU_SECONDARY_ACTION_STYLE}
          >
            {uploadingAvatar
              ? t("profilePublicationCard.actions.sending")
              : t("profilePublicationCard.actions.avatar")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="image"
            disabled={uploadingCover}
            onClick={() => coverInput.current?.click()}
            style={RESEAU_SECONDARY_ACTION_STYLE}
          >
            {uploadingCover
              ? t("profilePublicationCard.actions.sending")
              : t("profilePublicationCard.actions.cover")}
          </Button>
          {person.avatar !== null ? (
            <Button
              variant="danger"
              size="sm"
              style={themedActionStyle("danger", "ghost", RESEAU_SECONDARY_ACTION_STYLE)}
              onClick={() => removeImage("avatar")}
            >
              {t("profilePublicationCard.actions.removeAvatar")}
            </Button>
          ) : null}
          {person.cover !== null ? (
            <Button
              variant="danger"
              size="sm"
              style={themedActionStyle("danger", "ghost", RESEAU_SECONDARY_ACTION_STYLE)}
              onClick={() => removeImage("cover")}
            >
              {t("profilePublicationCard.actions.removeCover")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            icon="edit"
            onClick={openEditor}
            style={RESEAU_SECONDARY_ACTION_STYLE}
          >
            {t("profilePublicationCard.actions.edit")}
          </Button>
          {/* Le mode privé AVANT la dépublication, et c'est délibéré : il
              répond au même besoin — ne plus être sollicité — sans rendre son
              nom neutre partout ni rompre ses relations. La dépublication
              reste offerte, juste après, pour qui veut vraiment tout
              refermer. */}
          <Button
            variant="secondary"
            size="sm"
            style={RESEAU_SECONDARY_ACTION_STYLE}
            onClick={() => {
              const goingPrivate = !person.private
              void setPrivacy({ private: goingPrivate })
                .then(() =>
                  toast.success(
                    goingPrivate
                      ? t("profilePublicationCard.toast.nowOffline")
                      : t("profilePublicationCard.toast.backOnline"),
                  ),
                )
                .catch((err: unknown) =>
                  toast.error(
                    profileErrorText(err, "reseau:profilePublicationCard.toast.privacyFailed", t),
                  ),
                )
            }}
          >
            {person.private
              ? t("profilePublicationCard.actions.goOnline")
              : t("profilePublicationCard.actions.goOffline")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            style={RESEAU_SECONDARY_ACTION_STYLE}
            onClick={() =>
              void withdraw({})
                .then(() =>
                  toast.success(t("profilePublicationCard.toast.withdrawn")),
                )
                .catch((err: unknown) =>
                  toast.error(
                    profileErrorText(err, "reseau:profilePublicationCard.toast.withdrawFailed", t),
                  ),
                )
            }
          >
            {t("profilePublicationCard.actions.withdraw")}
          </Button>
        </div>
      </div>
    </Card>
  )
}
