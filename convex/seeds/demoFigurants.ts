/**
 * Figurants de la démonstration : dix personnes FICTIVES d'ambiance (fil, suggestions,
 * demandes de relation). Elles s'inscrivent par le vrai parcours OTP, sur une adresse
 * réservée `figurant-<n>@demo.antsia.test`, et n'apparaissent pas sur l'écran de connexion.
 * Aucun nom, aucune adresse ni aucun identifiant ne désigne une personne réelle.
 */
import type { ProvinceSlug } from "@antsia/social-domain/provinces"

import { DEMO_EMAIL_DOMAIN } from "../lib/devTools"

export type DemoFigurant = {
  slot: number
  handle: string
  givenNames: string
  familyName: string
  headline: string
  /** Portrait libre de droits du manifeste photo (`figurant-portrait-<n>`). */
  avatar: string
  province: ProvinceSlug
}

export const DEMO_FIGURANTS: readonly DemoFigurant[] = [
  { slot: 1, handle: "kevin.mounguengui.demo", givenNames: "kévin", familyName: "mounguengui", headline: "Développeur web à Libreville · Démo", avatar: "figurant-portrait-1", province: "estuaire" },
  { slot: 2, handle: "mireille.nzigou.demo", givenNames: "mireille", familyName: "nzigou", headline: "Couturière à Port-Gentil · Démo", avatar: "figurant-portrait-2", province: "ogooue-maritime" },
  { slot: 3, handle: "albert.mboumba.demo", givenNames: "albert", familyName: "mboumba", headline: "Enseignant retraité à Mouila · Démo", avatar: "figurant-portrait-3", province: "ngounie" },
  { slot: 4, handle: "ines.obame.demo", givenNames: "inès", familyName: "obame", headline: "Infirmière à Oyem · Démo", avatar: "figurant-portrait-4", province: "woleu-ntem" },
  { slot: 5, handle: "georgette.makaya.demo", givenNames: "georgette", familyName: "makaya", headline: "Conteuse à Tchibanga · Démo", avatar: "figurant-portrait-5", province: "nyanga" },
  { slot: 6, handle: "joseph.nguema.demo", givenNames: "joseph", familyName: "nguema", headline: "Pêcheur à Mayumba · Démo", avatar: "figurant-portrait-6", province: "nyanga" },
  { slot: 7, handle: "prisca.biyoghe.demo", givenNames: "prisca", familyName: "biyoghe", headline: "Coiffeuse à Libreville · Démo", avatar: "figurant-portrait-7", province: "estuaire" },
  { slot: 8, handle: "ulrich.ondo.demo", givenNames: "ulrich", familyName: "ondo", headline: "Étudiant en droit à Franceville · Démo", avatar: "figurant-portrait-8", province: "haut-ogooue" },
  { slot: 9, handle: "larissa.minko.demo", givenNames: "larissa", familyName: "minko", headline: "Étudiante en gestion à Libreville · Démo", avatar: "figurant-portrait-9", province: "estuaire" },
  { slot: 10, handle: "steeve.boussougou.demo", givenNames: "steeve", familyName: "boussougou", headline: "Chauffeur de taxi à Owendo · Démo", avatar: "figurant-portrait-10", province: "estuaire" },
]

/** L'adresse réservée d'un figurant (RFC 2606 : jamais routable). */
export function demoFigurantEmailOf(slot: number): string {
  return `figurant-${slot}@${DEMO_EMAIL_DOMAIN}`
}

export function demoFigurantOf(slot: number): DemoFigurant | undefined {
  return DEMO_FIGURANTS.find((figurant) => figurant.slot === slot)
}
