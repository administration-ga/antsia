/**
 * Copie ponctuelle d'un événement, RFC 5545 §§3.1, 3.3.11 et 3.6.1.
 * Aucun transport, participant, adresse, invitation ou abonnement implicite.
 */
export interface CalendarEventInput {
  readonly uid: string
  readonly title: string
  readonly description?: string | null
  readonly location?: string | null
  readonly startAt: number
  readonly endAt: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly sequence: number
  readonly status: "confirmed" | "tentative" | "cancelled"
}

function calendarInstant(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Invalid calendar instant")
  const date = new Date(value)
  const year = date.getUTCFullYear()
  if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999) throw new Error("Invalid calendar instant")
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

/** TEXT : ni nouvelle propriété injectée, ni transport de caractères de contrôle. */
function calendarText(value: string): string {
  return value.replace(/\r\n?|\u2028|\u2029/g, "\n")
    .replace(/\\/g, "\\\\").replace(/\n/g, "\\n")
    .replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\p{Cc}/gu, " ")
}

/** Pliage à 75 OCTETS, espace de continuation compris, sans couper un point Unicode. */
function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder()
  const folded: string[] = []
  let current = ""
  let bytes = 0
  for (const character of line) {
    const size = encoder.encode(character).byteLength
    if (bytes + size > 75) {
      folded.push(current)
      current = " "
      bytes = 1
    }
    current += character
    bytes += size
  }
  folded.push(current)
  return folded.join("\r\n")
}

/** Une copie privée ; TENTATIVE ne réserve aucune place et ne bloque pas le temps. */
export function serializeCalendarEvent(input: CalendarEventInput): string {
  const title = calendarText(input.title)
  if (!/^[A-Za-z0-9][A-Za-z0-9._@:-]{0,254}$/.test(input.uid)) throw new Error("Invalid calendar UID")
  if (!Number.isInteger(input.sequence) || input.sequence < 0 || input.sequence > 2_147_483_647) throw new Error("Invalid calendar sequence")
  if (Math.floor(input.endAt / 1000) <= Math.floor(input.startAt / 1000) || title.trim().length === 0) throw new Error("Invalid calendar event")
  if (input.status !== "confirmed" && input.status !== "tentative" && input.status !== "cancelled") throw new Error("Invalid calendar status")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NTSAGUI Digital//DIASPORA.GA Calendar//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${calendarInstant(input.updatedAt)}`,
    `CREATED:${calendarInstant(input.createdAt)}`,
    `LAST-MODIFIED:${calendarInstant(input.updatedAt)}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTART:${calendarInstant(input.startAt)}`,
    `DTEND:${calendarInstant(input.endAt)}`,
    `SUMMARY:${title}`,
    ...(input.description ? [`DESCRIPTION:${calendarText(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${calendarText(input.location)}`] : []),
    `STATUS:${input.status.toUpperCase()}`,
    `TRANSP:${input.status === "confirmed" ? "OPAQUE" : "TRANSPARENT"}`,
    "CLASS:PRIVATE",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return `${lines.map(foldCalendarLine).join("\r\n")}\r\n`
}
