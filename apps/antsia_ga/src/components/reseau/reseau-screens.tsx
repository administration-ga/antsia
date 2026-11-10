"use client"

import { AlbumPage } from "@antsia/social-features/albums"
import { ProfilPersonnePage } from "@antsia/social-features/reseau-personnel"

import { MemberPage } from "@/components/member-chrome"
import { PageWithCommerce } from "@/components/shops/page-commerce"

/** Le profil d'une personne du réseau (le mien compris : sa gestion s'y ouvre). */
export function ProfileScreen({ handle }: { handle: string }) {
  return (
    <MemberPage>
      <ProfilPersonnePage handle={handle} />
    </MemberPage>
  )
}

/** La fiche d'une page (identité propre : institution, association, média…), et de sa boutique si elle vend. */
export function PageProfileScreen({ handle }: { handle: string }) {
  return (
    <MemberPage>
      <PageWithCommerce handle={handle} />
    </MemberPage>
  )
}

/** La galerie d'un album, sous le profil qui la porte. */
export function AlbumScreen({ handle, albumId }: { handle: string; albumId: string }) {
  return (
    <MemberPage>
      <AlbumPage handle={handle} albumId={albumId} />
    </MemberPage>
  )
}
