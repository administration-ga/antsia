// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/SharePostDialog.tsx @ ad2e7fdc2 — adaptations : publication par le moteur et le réseau courant ; adresse membre injectée par useRoutes, copie sans écriture sociale ; citation sur geste explicite et selon l’audience ; dialogue accessible et responsive du kit partagé ; libellés et toasts par l’i18n.
"use client"

/**
 * Copier l'adresse d'une publication lisible n'en change pas l'audience.
 * La citation dans le fil, elle, réexpose : seul un original public et
 * disponible reçoit ce geste ; le moteur relit les droits à la publication.
 * Les médias restent ceux de l'original, aucun téléversement n'est proposé.
 */
import { themedActionStyle } from "../themed-action-style"
import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Button, Field, Select, TextArea, TextInput } from "@antsia/ui"
import { EspaceDialog, EspaceKitStyles } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import { Copy } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { postEngineErrorText } from "./post-overflow"
import {
  AUDIENCE_OPTIONS,
  DEFAULT_AUDIENCE,
  POST_MAX_LENGTH,
  shareExcerpt,
  type ReachAudience,
} from "./shared"

interface SharePostDialogProps {
  postId: Id<"posts">
  authorName: string
  excerpt: string
  /** Le lien reste copiable même si la publication ne peut pas être citée. */
  canQuote?: boolean
  onClose: () => void
}

export function SharePostDialog({ postId, authorName, excerpt, canQuote = true, onClose }: SharePostDialogProps) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const copyLock = useRef(false)
  const publishLock = useRef(false)
  const [copying, setCopying] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const link = routes.post && typeof window !== "undefined"
    ? new URL(routes.sharePath?.(routes.post(postId)) ?? routes.post(postId), window.location.origin).href
    : null
  // Les applications sans route de publication gardent leur formulaire existant.
  const [quoting, setQuoting] = useState(link === null)
  const [body, setBody] = useState("")
  const [audience, setAudience] = useState<ReachAudience>(DEFAULT_AUDIENCE)
  const [sending, setSending] = useState(false)
  const publish = useMutation(api.modules.posts.posts.publish)

  const copyLink = async () => {
    if (copyLock.current || link === null) return
    copyLock.current = true
    setCopying(true)
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(link)
      toast.success(t("sharePostDialog.copied"))
    } catch {
      setCopyFailed(true)
      input.current?.focus()
      input.current?.select()
    } finally {
      copyLock.current = false
      setCopying(false)
    }
  }

  const handleShare = async () => {
    if (!canQuote || publishLock.current) return
    publishLock.current = true
    setSending(true)
    try {
      await publish({ networkId, body: body.trim(), audience, sharedPostId: postId })
      toast.success(t("sharePostDialog.toast.shared"))
      onClose()
    } catch (error) {
      toast.error(postEngineErrorText(error, "reseau:sharePostDialog.toast.failed", t))
    } finally {
      publishLock.current = false
      setSending(false)
    }
  }

  return (
    <>
      <EspaceKitStyles />
      <EspaceDialog
        title={t("sharePostDialog.title", { name: authorName })}
        description={link ? t("sharePostDialog.linkHint") : undefined}
        onClose={onClose}
        closeLabel={t("sharePostDialog.close")}
      >
        <div className="flex min-w-0 flex-col gap-4">
          {link ? (
            <>
              <Field label={t("sharePostDialog.linkLabel")} htmlFor={`${id}-link`} error={copyFailed ? t("sharePostDialog.copyFailed") : undefined}>
                <TextInput
                  ref={input}
                  id={`${id}-link`}
                  value={link}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
              </Field>
              {/* aria-disabled conserve le focus pendant la copie asynchrone. */}
              <Button onClick={() => void copyLink()} aria-disabled={copying} aria-busy={copying}>
                <Copy aria-hidden="true" size={16} />{t("sharePostDialog.copyLink")}
              </Button>
              {canQuote ? (
                <Button
                  variant="secondary"
                  icon="share"
                  aria-expanded={quoting}
                  aria-controls={`${id}-quote`}
                  onClick={() => setQuoting((value) => !value)}
                >
                  {t("sharePostDialog.quote")}
                </Button>
              ) : null}
            </>
          ) : null}
          {canQuote && quoting ? (
            <div id={`${id}-quote`} className="flex min-w-0 flex-col gap-4">
              <p className="m-0 break-words border-l-2 border-border pl-3 text-sm text-muted-foreground">
                {shareExcerpt(excerpt, t)}
              </p>
              <Field label={t("sharePostDialog.wordLabel")} htmlFor={`${id}-word`}>
                <TextArea
                  id={`${id}-word`}
                  rows={3}
                  value={body}
                  maxLength={POST_MAX_LENGTH}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder={t("sharePostDialog.wordPlaceholder")}
                />
              </Field>
              <Field label={t("sharePostDialog.audienceLabel")} hint={t("sharePostDialog.audienceHint")} htmlFor={`${id}-audience`}>
                <Select id={`${id}-audience`} value={audience} onChange={(event) => setAudience(event.target.value as ReachAudience)}>
                  {AUDIENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                </Select>
              </Field>
              <div className="flex flex-wrap justify-end gap-2">
                <Button style={themedActionStyle("cancel", "ghost")} variant="outline" onClick={onClose}>{t("sharePostDialog.cancel")}</Button>
                <Button icon="share" disabled={sending} onClick={() => void handleShare()}>
                  {sending ? t("sharePostDialog.sending") : t("sharePostDialog.share")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </EspaceDialog>
    </>
  )
}
