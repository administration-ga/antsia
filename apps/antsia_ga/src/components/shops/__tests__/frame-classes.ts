const ENTITIES: Record<string, string> = { amp: "&", gt: ">", lt: "<", quot: "\"", "#x27": "'" }

/** Les classes du cadre d'écran rendu : le premier élément sous la page de membre, remplacée par <main> dans les tests. */
export function frameClasses(markup: string): string[] {
  const value = /<main><div class="([^"]*)"/u.exec(markup)?.[1] ?? ""
  return value.replace(/&(amp|gt|lt|quot|#x27);/gu, (_, name: string) => ENTITIES[name] ?? "").split(" ").filter(Boolean)
}

/** Ce qui borne et centre un écran dans sa colonne. */
export const centeringClasses = (classes: string[]) => classes.filter(name => name === "mx-auto" || name.startsWith("max-w-"))
