import { nativeEnvironment, type NativeEnvironment } from "@antsia/social-native/environment"

/** Explicit backend pairs; demo navigation never adopts the production native scheme. */
export function nativeDestinations(input: {
  production: Parameters<typeof nativeEnvironment>[0]
  demo?: Parameters<typeof nativeEnvironment>[0]
}): { production: NativeEnvironment | null; demo: NativeEnvironment | null } {
  const production = nativeEnvironment(input.production)
  if (!production || !input.demo) return { production, demo: null }
  const demo = nativeEnvironment(input.demo)
  if (!demo) return { production, demo: null }
  const productionOrigins = new Set([production.convexUrl, production.authUrl, production.webUrl])
  if (productionOrigins.has(demo.convexUrl) || productionOrigins.has(demo.authUrl) || demo.webUrl !== production.webUrl) {
    return { production, demo: null }
  }
  return { production, demo: { ...demo, webBasePath: "/demo", scheme: null } }
}
