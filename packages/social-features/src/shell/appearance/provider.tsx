// Dupliqué de socle/packages/ui-v2/src/components/theme-toggle.tsx @ 25398f565 — adaptations : lecture et suivi du système conservés ; provider persistant système/clair/sombre, préférence isolée par réseau, synchronisation entre onglets et stockage indisponible toléré ; la charte du moteur utilise .dark et color-scheme, sans data-theme ni dépendance additionnelle ; thème au choix du membre parmi ceux que l'application fournit (`themes`), mémorisé sous le même préfixe, posé par `data-charte` sur <html> et exposé aux surfaces portalisées (`charte`) ; rien n'est écrit sur <html> avant la relecture des préférences, que le script d'amorçage (`boot-script.ts`) y a posées avant l'affichage ; motif de fond au choix (`motifs`, aucun par défaut, ADR-0027), propre à l'appareil, posé par `data-motif` sur <html>.
"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type AppearanceMode = "system" | "light" | "dark"
export type ResolvedAppearance = "light" | "dark"

/** Un thème proposé par l'application : son identifiant et la charte (`data-charte`) qui l'habille. */
export interface AppearanceTheme {
  id: string
  charte: string
}

interface AppearanceContextValue {
  mode: AppearanceMode
  resolvedAppearance: ResolvedAppearance
  setMode: (mode: AppearanceMode) => void
  /** Les thèmes que l'application propose ; vide quand elle n'en propose pas. */
  themes: readonly AppearanceTheme[]
  /** Le thème choisi (le premier de la liste par défaut) ; `null` sans thèmes. */
  theme: string | null
  /** La charte du thème choisi, que les surfaces portalisées redéclarent ; `null` sans thèmes. */
  charte: string | null
  setTheme: (theme: string) => void
  /** Les motifs de fond que l'application propose ; vide quand elle n'en propose pas. */
  motifs: readonly string[]
  /** Le motif choisi, `null` pour un fond uni (le choix par défaut). */
  motif: string | null
  setMotif: (motif: string | null) => void
  /**
   * Le nom d'un thème dans la langue de la personne, fourni par l'application pour
   * le sélecteur du rail (`AppearanceControl`) ; `null` quand elle n'en fournit pas :
   * le rail ne propose alors aucun thème.
   */
  themeName: ((id: string) => string) | null
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)
const NO_THEMES: readonly AppearanceTheme[] = []
const NO_MOTIFS: readonly string[] = []

function isAppearanceMode(value: unknown): value is AppearanceMode {
  return value === "system" || value === "light" || value === "dark"
}

function readPreference(storageKey: string): AppearanceMode {
  try {
    const stored = window.localStorage.getItem(storageKey)
    return isAppearanceMode(stored) ? stored : "system"
  } catch {
    return "system"
  }
}

/** Un thème mémorisé qui n'est plus proposé retombe sur le thème par défaut. */
function knownTheme(themes: readonly AppearanceTheme[], value: string | null): string | null {
  return value !== null && themes.some((theme) => theme.id === value) ? value : (themes[0]?.id ?? null)
}

/** Un motif mémorisé qui n'est plus proposé retombe sur le fond uni. */
function knownMotif(motifs: readonly string[], value: string | null): string | null {
  return value !== null && motifs.includes(value) ? value : null
}

function readMotif(storageKey: string, motifs: readonly string[]): string | null {
  try {
    return knownMotif(motifs, window.localStorage.getItem(storageKey))
  } catch {
    return null
  }
}

function readTheme(storageKey: string, themes: readonly AppearanceTheme[]): string | null {
  try {
    return knownTheme(themes, window.localStorage.getItem(storageKey))
  } catch {
    return knownTheme(themes, null)
  }
}

export interface AppearanceProviderProps {
  /** Le préfixe du réseau courant, fourni aussi aux magasins de la coque. */
  storagePrefix: string
  /**
   * Les thèmes que le membre peut choisir, le premier étant celui par défaut.
   * Absent : aucun choix de thème, la charte posée par la page reste intacte.
   */
  themes?: readonly AppearanceTheme[]
  /**
   * Les motifs de fond que le membre peut activer (points, quadrillage…). Le fond
   * reste uni par défaut ; absent : aucun motif, `data-motif` n'est jamais touché.
   */
  motifs?: readonly string[]
  /**
   * Le nom d'un thème, dans la langue de la personne, pour le sélecteur du rail
   * (`AppearanceControl`). Absent : le rail ne propose pas de thème ; le choix reste
   * offert là où l'application le rend elle-même (Préférences > Thème).
   */
  themeName?: (id: string) => string
  children: ReactNode
}

/** Une seule préférence à la racine : changer d'habit ne remonte aucune salle. */
export function AppearanceProvider({ storagePrefix, themes = NO_THEMES, motifs = NO_MOTIFS, themeName, children }: AppearanceProviderProps) {
  // Valeurs stables au serveur et au premier rendu client ; le navigateur est
  // consulté après le montage, comme dans le patron du socle.
  const [mode, setModeState] = useState<AppearanceMode>("system")
  const [systemDark, setSystemDark] = useState(false)
  const [theme, setThemeState] = useState<string | null>(() => knownTheme(themes, null))
  const [motif, setMotifState] = useState<string | null>(null)
  // Tant que les préférences ne sont pas relues, <html> garde ce que le script
  // d'amorçage (`boot-script.ts`) y a posé avant l'affichage : les valeurs du
  // premier rendu ne l'écrasent pas le temps d'un cadre.
  const [ready, setReady] = useState(false)
  const storageKey = `${storagePrefix}appearance`
  const themeKey = `${storagePrefix}theme`
  const motifKey = `${storagePrefix}motif`

  useEffect(() => {
    let media: MediaQueryList | null = null
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)")
    } catch {
      // Un navigateur sans cette API conserve le repli clair.
    }
    setSystemDark(media?.matches ?? false)
    setModeState(readPreference(storageKey))
    setThemeState(readTheme(themeKey, themes))
    setMotifState(readMotif(motifKey, motifs))
    setReady(true)

    const onSystemChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== themeKey && event.key !== motifKey && event.key !== null) return
      try {
        if (event.storageArea !== null && event.storageArea !== window.localStorage) return
      } catch {
        return
      }
      if (event.key === themeKey || event.key === null) setThemeState(knownTheme(themes, event.newValue))
      if (event.key === motifKey || event.key === null) setMotifState(knownMotif(motifs, event.newValue))
      if (event.key === themeKey || event.key === motifKey) return
      if (event.newValue === null) setModeState("system")
      else if (isAppearanceMode(event.newValue)) setModeState(event.newValue)
    }

    media?.addEventListener("change", onSystemChange)
    window.addEventListener("storage", onStorage)
    return () => {
      media?.removeEventListener("change", onSystemChange)
      window.removeEventListener("storage", onStorage)
    }
  }, [storageKey, themeKey, motifKey, themes, motifs])

  const resolvedAppearance: ResolvedAppearance = mode === "system" ? (systemDark ? "dark" : "light") : mode
  const charte = themes.find((entry) => entry.id === theme)?.charte ?? null

  useEffect(() => {
    if (!ready) return
    document.documentElement.classList.toggle("dark", resolvedAppearance === "dark")
    document.documentElement.style.colorScheme = resolvedAppearance
  }, [ready, resolvedAppearance])

  useEffect(() => {
    // Sans thèmes proposés, la charte posée par la page n'est jamais touchée.
    if (ready && charte !== null) document.documentElement.dataset.charte = charte
  }, [ready, charte])

  useEffect(() => {
    // Sans motifs proposés, `data-motif` n'est jamais touché (DIASPORALE, console).
    if (!ready || motifs.length === 0) return
    if (motif !== null) document.documentElement.dataset.motif = motif
    else delete document.documentElement.dataset.motif
  }, [ready, motif, motifs])

  const setMode = useCallback((next: AppearanceMode) => {
    if (!isAppearanceMode(next)) return
    setModeState(next)
    try {
      // L'absence de choix explicite retrouve le suivi du système, y compris
      // dans les autres onglets. Aucune autre préférence n'est touchée.
      if (next === "system") window.localStorage.removeItem(storageKey)
      else window.localStorage.setItem(storageKey, next)
    } catch {
      // Le choix en mémoire reste actif même quand le stockage est refusé.
    }
  }, [storageKey])

  const setTheme = useCallback((next: string) => {
    if (!themes.some((entry) => entry.id === next)) return
    setThemeState(next)
    try {
      // Le thème par défaut ne laisse aucune trace : la clé disparaît.
      if (next === themes[0]?.id) window.localStorage.removeItem(themeKey)
      else window.localStorage.setItem(themeKey, next)
    } catch {
      // Le choix en mémoire reste actif même quand le stockage est refusé.
    }
  }, [themeKey, themes])

  const setMotif = useCallback((next: string | null) => {
    if (next !== null && !motifs.includes(next)) return
    setMotifState(next)
    try {
      // Le fond uni, choix par défaut, ne laisse aucune trace : la clé disparaît.
      if (next === null) window.localStorage.removeItem(motifKey)
      else window.localStorage.setItem(motifKey, next)
    } catch {
      // Le choix en mémoire reste actif même quand le stockage est refusé.
    }
  }, [motifKey, motifs])

  const value = useMemo(
    () => ({ mode, resolvedAppearance, setMode, themes, theme, charte, setTheme, motifs, motif, setMotif, themeName: themeName ?? null }),
    [mode, resolvedAppearance, setMode, themes, theme, charte, setTheme, motifs, motif, setMotif, themeName],
  )
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

/** Les applications qui n'ont pas encore monté le provider n'offrent pas le contrôle. */
export function useOptionalAppearance(): AppearanceContextValue | null {
  return useContext(AppearanceContext)
}
