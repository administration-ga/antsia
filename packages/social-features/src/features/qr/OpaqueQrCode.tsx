"use client"

import QRCode from "react-qr-code"

/** QR local : aucune image distante, aucun contenu ajouté à la valeur reçue. */
export function OpaqueQrCode({ value, title, size = 208 }: { readonly value: string; readonly title: string; readonly size?: number }) {
  return (
    <div className="inline-flex max-w-full rounded-[var(--esp-primitive-media-radius,0.5rem)] p-6" style={{ backgroundColor: "var(--esp-neutral-0)", color: "var(--esp-neutral-900)" }}>
      <QRCode value={value} title={title} size={size} level="M" bgColor="transparent" fgColor="currentColor" style={{ height: "auto", maxWidth: "100%" }} />
    </div>
  )
}
