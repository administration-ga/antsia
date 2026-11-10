"use client"

import { useOverlayContainer } from "@antsia/ui/sheet"
import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * Une couche posée au-dessus de l'écran (bouton flottant, barre d'achat fixe). Elle est rendue dans l'hôte des
 * surfaces portalisées de la coque (sa charte), sinon dans `<body>` : un conteneur de requêtes (`@container`)
 * ou une mise en page confinée ne peut donc jamais la cadrer à la place de la fenêtre. Rien au rendu serveur.
 */
export function FloatingLayer({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const container = useOverlayContainer()
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(children, container ?? document.body)
}
