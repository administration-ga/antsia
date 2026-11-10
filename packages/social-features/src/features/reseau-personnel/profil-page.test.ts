// Réécrit d'après socle/packages/agent-features/src/features/reseau-personnel/profil-page.test.ts @ ad2e7fdc2 — ce qui change : textes lus dans l'i18n du moteur (français, et l'anglais pour le refus indistinct) ; « administration » devient « page » ; nombres mis en forme par `Intl` (toujours exacts, jamais plafonnés) ; le droit de publier se lit dans le rôle VIVANT ; cas ajoutés : rôle du lecteur, revendication et vérification, dernière demande, pièces et note jugées par les règles du serveur, identité modifiable, identifiant d'un signataire.
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import {
  canManagePageAs,
  canPublishAsPage,
  checkPageIdentity,
  claimEvidenceRefusal,
  claimIsPending,
  claimNoteRefusal,
  claimStatusText,
  claimSubmittedText,
  identityDraftOf,
  isEmptyIdentityPatch,
  latestClaimFor,
  PAGE_REFUSAL_BODY_KEY,
  PAGE_REFUSAL_TITLE_KEY,
  pageClaimAction,
  pageClaimIntro,
  pageClaimTitle,
  pageFileRefusal,
  pageFollowButtonLabel,
  pageFollowerCountLabel,
  pagePostCountLabel,
  pageRefusalTexts,
  pageRoleNote,
  pageUploadAccept,
  pageWallEmptyText,
  signatoryDisplayName,
  signatoryHandleOf,
  type PageIdentityCurrent,
  preparePageImage,
} from "./profil-page"
import { jpegHasGpsMetadata, listImageMetadata } from "@antsia/social-domain/imageMetadata"
import { isPreparedImage } from "../media-upload"
import { TEST_JPEG_WITH_GPS_BYTES, TEST_PNG_BYTES, testPrepareImageWith } from "../../tests/image-runtime"

const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" })
const t = i18n.getFixedT("fr")
const tEn = i18n.getFixedT("en")
const nombre = (n: number) => new Intl.NumberFormat("fr").format(n)
const MO = 1024 * 1024

describe("le refus indistinct d'une page", () => {
  // `getPage` : une page inconnue, retirée ou d'un autre réseau rend `null`
  // sans distinction. Un futur contributeur qui réintroduirait l'un des mots
  // qui tranchent romprait l'anti-énumération sans qu'aucun autre test ne le
  // voie — celui-ci est le seul filet, dans les DEUX langues.
  it("ne prononce jamais les mots qui trancheraient entre les causes", () => {
    const { title, body } = pageRefusalTexts(t)
    const text = `${title} ${body}`.toLowerCase()
    expect(text).not.toContain("désactivée")
    expect(text).not.toContain("desactivee")
    expect(text).not.toContain("n'existe pas")
    expect(text).not.toContain("supprimée")
    expect(text).not.toContain("retirée")
    const english = `${tEn(PAGE_REFUSAL_TITLE_KEY)} ${tEn(PAGE_REFUSAL_BODY_KEY)}`.toLowerCase()
    for (const word of ["deactivated", "disabled", "does not exist", "doesn't exist", "deleted", "removed"]) {
      expect(english).not.toContain(word)
    }
  })

  it("affiche la phrase attendue par la doctrine", () => {
    expect(pageRefusalTexts(t).title).toBe("Cette page n'est pas accessible.")
  })
})

describe("pageFollowButtonLabel", () => {
  it("dit « Suivi » quand on suit déjà la page", () => {
    expect(pageFollowButtonLabel(true, t)).toBe("Suivi")
  })

  it("dit « Suivre » sinon", () => {
    expect(pageFollowButtonLabel(false, t)).toBe("Suivre")
  })
})

describe("pageWallEmptyText", () => {
  it("invite à publier quand on le peut", () => {
    expect(pageWallEmptyText(true, t)).toBe("Cette page n'a encore rien publié. Vous pouvez publier en son nom ci-dessus.")
  })

  it("reste neutre sinon, sans inviter à un geste impossible", () => {
    const text = pageWallEmptyText(false, t)
    expect(text).toBe("Cette page n'a encore rien publié.")
    expect(text).not.toContain("Vous pouvez publier")
  })
})

describe("pageFollowerCountLabel", () => {
  it("accorde le singulier", () => {
    expect(pageFollowerCountLabel(1, t)).toBe("1 abonné")
  })

  it("accorde le pluriel", () => {
    expect(pageFollowerCountLabel(12, t)).toBe("12 abonnés")
  })

  it("dit le VRAI nombre, sans plafond", () => {
    // Un plafond (« 200+ ») n'a de sens que pour un total que le serveur BORNE
    // en le comptant. Les abonnés d'une page sont comptés exactement : les
    // plafonner ferait affirmer « 200+ » à une page qui en compte des milliers.
    expect(pageFollowerCountLabel(500, t)).toBe("500 abonnés")
    expect(pageFollowerCountLabel(4812, t)).toBe(`${nombre(4812)} abonnés`)
    expect(pageFollowerCountLabel(4812, t)).not.toContain("+")
  })

  it("dit « Aucun abonné » à zéro", () => {
    expect(pageFollowerCountLabel(0, t)).toBe("Aucun abonné")
  })
})

describe("pagePostCountLabel", () => {
  it("accorde le singulier", () => {
    expect(pagePostCountLabel(1, t)).toBe("1 publication")
  })

  it("accorde le pluriel", () => {
    expect(pagePostCountLabel(3, t)).toBe("3 publications")
  })

  it("dit le VRAI nombre, sans plafond", () => {
    expect(pagePostCountLabel(500, t)).toBe("500 publications")
    expect(pagePostCountLabel(12000, t)).toBe(`${nombre(12000)} publications`)
  })

  it("dit « Aucune publication » à zéro", () => {
    expect(pagePostCountLabel(0, t)).toBe("Aucune publication")
    expect(pagePostCountLabel(0, tEn)).toBe("No posts")
  })
})

describe("le rôle VIVANT du lecteur", () => {
  it("publie au nom de la page avec n'importe quel rôle vivant, gère en administrateur seulement", () => {
    expect(canPublishAsPage("admin")).toBe(true)
    expect(canPublishAsPage("signatory")).toBe(true)
    expect(canPublishAsPage(null)).toBe(false)
    expect(canManagePageAs("admin")).toBe(true)
    expect(canManagePageAs("signatory")).toBe(false)
    expect(canManagePageAs(null)).toBe(false)
  })

  it("dit son rôle à qui en a un, rien aux autres", () => {
    expect(pageRoleNote(null, t)).toBeNull()
    expect(pageRoleNote("admin", t)).toContain("gérez ses signataires")
    expect(pageRoleNote("signatory", t)).toContain("vous publiez en son nom")
  })
})

describe("revendiquer, faire vérifier", () => {
  it("une page Officiel ou Vérifié ne se revendique jamais", () => {
    for (const role of ["admin", "signatory", null] as const) {
      expect(pageClaimAction("official", role)).toBeNull()
      expect(pageClaimAction("verified", role)).toBeNull()
    }
  })

  it("une page de la communauté : vérification par son administrateur, revendication par un lecteur", () => {
    expect(pageClaimAction("community", "admin")).toBe("verify")
    expect(pageClaimAction("community", null)).toBe("claim")
    // Un simple signataire n'a rien à demander : la page a déjà un administrateur vivant.
    expect(pageClaimAction("community", "signatory")).toBeNull()
  })

  it("titre et présente chaque geste", () => {
    expect(pageClaimTitle("claim", t)).toBe("Revendiquer cette page")
    expect(pageClaimTitle("verify", t)).toBe("Demander la vérification")
    expect(pageClaimIntro("claim", t)).toContain("statuts")
  })

  it("retient MA dernière demande pour CETTE page", () => {
    const claims = [
      { claimId: "c1", page: { pageId: "p1" }, status: "rejected" as const, createdAt: 10 },
      { claimId: "c2", page: { pageId: "p2" }, status: "pending" as const, createdAt: 30 },
      { claimId: "c3", page: { pageId: "p1" }, status: "pending" as const, createdAt: 20 },
    ]
    expect(latestClaimFor(claims, "p1")?.claimId).toBe("c3")
    expect(latestClaimFor(claims, "p3")).toBeNull()
    expect(claimIsPending(latestClaimFor(claims, "p1"))).toBe(true)
    expect(claimIsPending(claims[0] ?? null)).toBe(false)
    expect(claimIsPending(null)).toBe(false)
  })

  it("dit l'état d'une demande et sa date dans la langue courante", () => {
    expect(claimStatusText("pending", t)).toContain("en cours d'examen")
    expect(claimStatusText("rejected", t)).toContain("refusée")
    const at = Date.UTC(2026, 9, 15, 12)
    expect(claimSubmittedText(at, "fr", t)).toBe(`Déposée le ${new Intl.DateTimeFormat("fr", { dateStyle: "long" }).format(new Date(at))}.`)
  })
})

describe("fichiers d'une page — jugés comme au serveur", () => {
  it("accepte une image de logo dans sa borne", () => {
    expect(pageFileRefusal("page_logo", { type: "image/png", size: 200_000 }, t)).toBeNull()
  })

  it("refuse un type hors de la liste blanche de l'usage", () => {
    expect(pageFileRefusal("page_logo", { type: "application/pdf", size: 1000 }, t)).toBe(t("rules:UPLOAD_TYPE_NOT_ALLOWED"))
    // Une pièce de revendication, elle, peut être un PDF.
    expect(pageFileRefusal("page_claim_evidence", { type: "application/pdf", size: 1000 }, t)).toBeNull()
  })

  it("refuse un fichier vide ou trop lourd, en disant la borne", () => {
    expect(pageFileRefusal("page_logo", { type: "image/png", size: 0 }, t)).toBe(t("rules:UPLOAD_SIZE_OUT_OF_RANGE", { maxMegabytes: 5 }))
    expect(pageFileRefusal("page_banner", { type: "image/jpeg", size: 11 * MO }, t)).toBe(t("rules:UPLOAD_SIZE_OUT_OF_RANGE", { maxMegabytes: 10 }))
  })

  it("propose au sélecteur de fichiers la liste blanche même de l'usage", () => {
    expect(pageUploadAccept("page_logo").split(",")).toContain("image/png")
    expect(pageUploadAccept("page_logo")).not.toContain("application/pdf")
    expect(pageUploadAccept("page_claim_evidence").split(",")).toContain("application/pdf")
  })

  it("exige d'une à cinq pièces, et une note bornée", () => {
    expect(claimEvidenceRefusal(0, t)).toBe(t("rules:PAGE_CLAIM_EVIDENCE_COUNT", { max: 5 }))
    expect(claimEvidenceRefusal(6, t)).toBe(t("rules:PAGE_CLAIM_EVIDENCE_COUNT", { max: 5 }))
    expect(claimEvidenceRefusal(1, t)).toBeNull()
    expect(claimNoteRefusal("", t)).toBeNull()
    expect(claimNoteRefusal("x".repeat(1001), t)).toBe(t("rules:PAGE_CLAIM_NOTE_TOO_LONG", { max: 1000 }))
  })
})

describe("checkPageIdentity — seul ce qui change part", () => {
  const current: PageIdentityCurrent = { name: "Médias du Gabon", shortName: "MDG", description: null, country: "GA" }

  it("un formulaire inchangé ne produit aucun correctif", () => {
    const check = checkPageIdentity(current, identityDraftOf(current), t)
    expect(check).toEqual({ ok: true, patch: {} })
    if (check.ok) expect(isEmptyIdentityPatch(check.patch)).toBe(true)
  })

  it("envoie les seuls champs changés ; un champ vidé s'efface (`null`)", () => {
    const draft = { ...identityDraftOf(current), shortName: "  ", description: " Le média du pays. ", country: null }
    expect(checkPageIdentity(current, draft, t)).toEqual({ ok: true, patch: { shortName: null, description: "Le média du pays.", country: null } })
  })

  it("refuse un nom vide, sous son champ", () => {
    const check = checkPageIdentity(current, { ...identityDraftOf(current), name: " " }, t)
    expect(check.ok).toBe(false)
    if (check.ok) return
    expect(check.errors.name).toBe(t("rules:PAGE_NAME_LENGTH", { max: 120 }))
  })
})

describe("signataires", () => {
  it("lit l'identifiant saisi, avec ou sans arobase", () => {
    expect(signatoryHandleOf("  @awa.ndong ")).toBe("awa.ndong")
    expect(signatoryHandleOf("awa.ndong")).toBe("awa.ndong")
    expect(signatoryHandleOf(" @ ")).toBeNull()
  })

  it("nomme un signataire par son nom publié, à défaut son adresse, à défaut une mention neutre", () => {
    expect(signatoryDisplayName({ displayName: "Awa", handle: "awa" }, t)).toBe("Awa")
    expect(signatoryDisplayName({ displayName: null, handle: "awa" }, t)).toBe("@awa")
    expect(signatoryDisplayName({ displayName: null, handle: null }, t)).toBe("Profil non publié")
  })
})

describe("preparePageImage — logo et bannière partent sans métadonnées (PF-03)", () => {
  const gps = (name = "banniere.jpg") => new File([TEST_JPEG_WITH_GPS_BYTES as Uint8Array<ArrayBuffer>], name, { type: "image/jpeg" })

  it("la bannière : image préparée à 2 048 px, sans position GPS, jamais l'original", async () => {
    const prepare = testPrepareImageWith({ width: 6000, height: 2000, output: { bytes: TEST_JPEG_WITH_GPS_BYTES, type: "image/jpeg" } })
    const original = gps()
    const result = await preparePageImage("page_banner", original, t, prepare)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file).not.toBe(original)
    expect(isPreparedImage(result.file)).toBe(true)
    expect(prepare.runtime.canvases).toEqual([{ width: 2048, height: 683 }])
    const sent = new Uint8Array(await result.file.arrayBuffer())
    expect(jpegHasGpsMetadata(sent)).toBe(false)
    expect(listImageMetadata(sent, "image/jpeg")).toEqual([])
  })

  it("le logo : borné à 1 024 px, un PNG reste PNG", async () => {
    const prepare = testPrepareImageWith({ width: 3000, height: 3000 })
    const result = await preparePageImage("page_logo", new File([TEST_PNG_BYTES as Uint8Array<ArrayBuffer>], "logo.png", { type: "image/png" }), t, prepare)
    expect(result.ok && result.file.type).toBe("image/png")
    expect(prepare.runtime.canvases).toEqual([{ width: 1024, height: 1024 }])
  })

  it("le fichier choisi est jugé comme avant ; un ré-encodage impossible refuse, sans retomber sur l'original", async () => {
    const prepare = testPrepareImageWith()
    expect(await preparePageImage("page_logo", new File(["x"], "a.gif", { type: "image/gif" }), t, prepare)).toEqual({ ok: false, refus: "Ce type de fichier n'est pas accepté ici." })
    expect(prepare.runtime.decoded).toEqual([])
    expect(await preparePageImage("page_banner", gps(), t, testPrepareImageWith({ output: null }))).toEqual({
      ok: false,
      refus: "La préparation de « banniere.jpg » a échoué : cette photo ne sera pas envoyée.",
    })
  })
})
