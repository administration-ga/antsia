/**
 * Presentation derived only from the public display name, never identity
 * evidence or a membership status. Opt-in tokens keep the historical palette
 * unchanged for networks which do not declare the ANTSIA avatar variants.
 */
const IDENTITY_TONES = [
  { background: "var(--esp-avatar-1-bg, var(--primary-50))", color: "var(--esp-avatar-1-fg, var(--primary-600))" },
  { background: "var(--esp-avatar-2-bg, var(--primary-50))", color: "var(--esp-avatar-2-fg, var(--primary-600))" },
  { background: "var(--esp-avatar-3-bg, var(--primary-50))", color: "var(--esp-avatar-3-fg, var(--primary-600))" },
  { background: "var(--esp-avatar-4-bg, var(--primary-50))", color: "var(--esp-avatar-4-fg, var(--primary-600))" },
  { background: "var(--esp-avatar-5-bg, var(--primary-50))", color: "var(--esp-avatar-5-fg, var(--primary-600))" },
  { background: "var(--esp-avatar-6-bg, var(--primary-50))", color: "var(--esp-avatar-6-fg, var(--primary-600))" },
] as const

export function identityToneStyle(
  displayName: string,
  hasIdentity = true,
): { background: string; color: string } {
  const name = displayName.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase()
  if (!hasIdentity || name.length === 0) {
    return {
      background: "var(--esp-avatar-neutral-bg, var(--primary-50))",
      color: "var(--esp-avatar-neutral-fg, var(--primary-600))",
    }
  }

  let hash = 0
  for (const character of name) hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0
  return { ...IDENTITY_TONES[hash % IDENTITY_TONES.length]! }
}

const FONT_TOKENS: Readonly<Partial<Record<number, string>>> = {
  24: "--esp-avatar-font-24",
  32: "--esp-avatar-font-32",
  40: "--esp-avatar-font-40",
  48: "--esp-avatar-font-48",
  64: "--esp-avatar-font-64",
  104: "--esp-avatar-font-104",
}

export function avatarInitialsFontSize(size: number): string | number {
  const fallback = Math.round(size * 0.38)
  const token = FONT_TOKENS[size]
  return token ? `var(${token}, ${fallback}px)` : fallback
}
