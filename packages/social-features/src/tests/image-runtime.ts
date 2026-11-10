/**
 * Un décodeur et un canvas SIMULÉS pour la préparation des photos
 * (`features/media-upload`) : `jsdom` n'a pas de canvas. Le module, lui, est
 * le vrai — seule l'exécution du navigateur est remplacée, par la porte
 * d'injection prévue (`ImageRuntime`).
 *
 * Fichier de TEST (dossier `tests/`) : jamais importé par une source.
 */
import { prepareImageForUpload, type ImageRuntime, type PrepareImage } from "../features/media-upload"

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

/** Un JPEG 2×2 réel (libjpeg-turbo), sans aucune métadonnée. */
export const TEST_JPEG_BYTES = fromBase64(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAdEAACAgMAAwAAAAAAAAAAAAABAgADBAUGBxIh/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAZEQACAwEAAAAAAAAAAAAAAAAAAgEDMnH/2gAMAwEAAhEDEQA/AKb5zx/y+Rz2rtt5vUWWvi1M7vg1FmJQEkn1+mIiTOvC8BX1J//Z",
)

/**
 * Un JPEG 2×2 réel (Pillow) qui porte un APP1 EXIF avec un bloc GPS — valeurs
 * FICTIVES : 1° 2′ 3″ N, 4° 5′ 6″ E, fabricant « Phone ».
 */
export const TEST_JPEG_WITH_GPS_BYTES = fromBase64(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4QCaRXhpZgAATU0AKgAAAAgAAgEPAAIAAAAGAAAAJoglAAQAAAABAAAALAAAAABQaG9uZQAABAABAAIAAAACTgAAAAACAAUAAAADAAAAYgADAAIAAAACRQAAAAAEAAUAAAADAAAAegAAAAAAAAABAAAAAQAAAAIAAAABAAAAAwAAAAEAAAAEAAAAAQAAAAUAAAABAAAABgAAAAH/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6T0PwN4bl0XT3fw/pbu1vGWZrKMknaOT8tFFFfi5xH//Z",
)

/** Un PNG 2×2 réel, sans métadonnée. */
export const TEST_PNG_BYTES = fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNMrVVnYWFh0dPT09XVBQARDgIshTlTDwAAAABJRU5ErkJggg==",
)

export interface FakeImageRuntimeOptions {
  /** Dimensions affichées que le décodeur rend (défaut : 4 032 × 3 024, une photo de téléphone). */
  width?: number
  height?: number
  /** Le décodeur lève : image illisible. */
  decodeFails?: boolean
  /** Pas de canvas, ou un canvas sans contexte 2D. */
  canvas?: "absent" | "no-context"
  /**
   * Ce que l'encodeur rend : octets et type. Défaut : le JPEG 2×2 nu pour un
   * JPEG demandé, le PNG 2×2 pour un PNG, et du PNG pour un WebP (comme un
   * navigateur qui n'encode pas le WebP). `null` : l'encodeur ne rend rien.
   */
  output?: { bytes: Uint8Array; type: string } | null
}

export interface FakeImageRuntime extends ImageRuntime {
  /** Les canvas créés, dans l'ordre. */
  readonly canvases: { width: number; height: number }[]
  /** Les types et qualités demandés à l'encodeur. */
  readonly encodings: { type: string; quality: number }[]
  /** Les fichiers passés au décodeur. */
  readonly decoded: Blob[]
  /** Le nombre de décodages libérés. */
  released: number
}

export function fakeImageRuntime(options: FakeImageRuntimeOptions = {}): FakeImageRuntime {
  const runtime: FakeImageRuntime = {
    canvases: [],
    encodings: [],
    decoded: [],
    released: 0,
    async decode(file) {
      runtime.decoded.push(file)
      // Comme un navigateur : ce qui n'est pas une image ne se décode pas.
      if (options.decodeFails || !file.type.startsWith("image/")) throw new Error("illisible")
      return {
        width: options.width ?? 4032,
        height: options.height ?? 3024,
        source: {} as CanvasImageSource,
        release: () => {
          runtime.released += 1
        },
      }
    },
    createCanvas(width, height) {
      if (options.canvas === "absent") return null
      runtime.canvases.push({ width, height })
      return {
        getContext: () =>
          options.canvas === "no-context"
            ? null
            : { imageSmoothingEnabled: false, imageSmoothingQuality: "low", drawImage: () => undefined },
        toBlob: (callback, type, quality) => {
          runtime.encodings.push({ type, quality })
          if (options.output === null) return callback(null)
          const output =
            options.output ?? (type === "image/jpeg" ? { bytes: TEST_JPEG_BYTES, type } : { bytes: TEST_PNG_BYTES, type: "image/png" })
          callback(new Blob([output.bytes as Uint8Array<ArrayBuffer>], { type: output.type }))
        },
      }
    },
  }
  return runtime
}

/** La préparation RÉELLE, sur le décodeur et le canvas simulés — ce que les écrans reçoivent en test. */
export function testPrepareImage(options: FakeImageRuntimeOptions = {}): PrepareImage & { runtime: FakeImageRuntime } {
  const runtime = fakeImageRuntime(options)
  const prepare = (file: File) => prepareImageForUpload(file, runtime)
  return Object.assign(prepare, { runtime })
}
