"use client"

import { api } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import type { ServiceOptionsResult } from "@convex/modules/shops/serviceRules"
import { useAction } from "convex/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useShopAction } from "@/components/shops/shop-ui"
import { useServiceReview } from "./service-intent-guard"

/** Première lecture réelle, puis relecture manuelle après toute coupure. */
export function useServiceOptions(handle: string, offerRef: string) {
  const { networkId } = useNetwork()
  const load = useAction(api.modules.shops.serviceActions.options)
  const action = useShopAction()
  const review = useServiceReview()
  const [options, setOptions] = useState<ServiceOptionsResult | null>(null)
  const started = useRef(false)
  const read = useCallback(async () => {
    if (!navigator.onLine) return false
    const result = await action.run(() => load({ networkId, handle, offerRef }))
    if (!result || !action.current() || !navigator.onLine) return false
    setOptions(result)
    return result.outcome === "ready"
  }, [action.run, action.current, handle, load, networkId, offerRef])
  useEffect(() => {
    if (started.current || !review.online || review.generation !== 0) return
    started.current = true
    void read()
  }, [read, review.online, review.generation])
  return { options, review, read, pending: action.pending || review.pending, error: action.error || review.error }
}
