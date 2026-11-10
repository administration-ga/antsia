/**
 * Enveloppe de test des surfaces : i18n du moteur (français), réseau courant,
 * adresses injectées et routeur en mémoire — ce que l'application monte autour
 * de toute surface (`NetworkProvider`, `RouterProvider`, `I18nextProvider`).
 *
 * Fichier de TEST (dossier `tests/`) : jamais importé par une source.
 */
import { NetworkProvider, type EngineNavigation, type EngineNavigationLayout, type EnginePostPresentation, type EngineRoutes, type NetworkContextValue } from "@antsia/api/network"
import type { Id } from "@antsia/api/engine"
import { RouterProvider, type RouterApi, type RouterImplementation } from "@antsia/api/routing"
import { render, type RenderOptions } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { createAppI18n } from "../i18n"

export const TEST_NETWORK_ID = "networks_test" as Id<"networks">
export const TEST_PERSON_ID = "persons_me" as Id<"persons">

export const TEST_ROUTES: EngineRoutes = {
  home: () => "/fil",
  messages: () => "/messages",
  stories: () => "/actus",
  profile: (handle) => `/profil/${handle}`,
  page: (handle) => `/page/${handle}`,
  conference: (sessionId) => `/conference/${sessionId}`,
}

/** Un routeur en mémoire : les navigations sont consignées, la page ne change pas. */
export function memoryRouter(initial: { pathname?: string; search?: string } = {}) {
  const calls: { method: keyof RouterApi; href?: string }[] = []
  const api: RouterApi = {
    push: (href) => void calls.push({ method: "push", href }),
    replace: (href) => void calls.push({ method: "replace", href }),
    back: () => void calls.push({ method: "back" }),
    forward: () => void calls.push({ method: "forward" }),
    refresh: () => void calls.push({ method: "refresh" }),
    prefetch: (href) => void calls.push({ method: "prefetch", href }),
  }
  const implementation: RouterImplementation = {
    useRouter: () => api,
    usePathname: () => initial.pathname ?? "/",
    useSearchParams: () => new URLSearchParams(initial.search ?? ""),
    useParams: () => ({}),
    LinkComponent: ({ href, children, ...rest }) => (
      <a href={href} {...rest}>
        {children}
      </a>
    ),
  }
  return { implementation, calls }
}

export function EngineTestWrapper(props: {
  children: ReactNode
  router?: RouterImplementation
  routes?: EngineRoutes
  personId?: Id<"persons">
  /** La présentation déclarée par l'application (`classic` sans valeur, comme DIASPORALE). */
  postPresentation?: EnginePostPresentation
  navigation?: EngineNavigation
  navigationLayout?: EngineNavigationLayout
  navigationLabels?: NetworkContextValue["navigationLabels"]
  PostArticleRenderer?: NetworkContextValue["PostArticleRenderer"]
}) {
  const i18n = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "social" })
  return (
    <I18nextProvider i18n={i18n}>
      <RouterProvider implementation={props.router ?? memoryRouter().implementation}>
        <NetworkProvider
          networkId={TEST_NETWORK_ID}
          slug="test"
          personId={props.personId ?? TEST_PERSON_ID}
          charte="antsia"
          routes={props.routes ?? TEST_ROUTES}
          liveAvailable
          postPresentation={props.postPresentation}
          navigation={props.navigation}
          navigationLayout={props.navigationLayout}
          navigationLabels={props.navigationLabels}
          PostArticleRenderer={props.PostArticleRenderer}
        >
          {props.children}
        </NetworkProvider>
      </RouterProvider>
    </I18nextProvider>
  )
}

/** `render` de testing-library, dans l'enveloppe du moteur. */
export function renderWithEngine(ui: ReactElement, options: Omit<RenderOptions, "wrapper"> & { router?: RouterImplementation; personId?: Id<"persons">; routes?: EngineRoutes; postPresentation?: EnginePostPresentation; navigation?: EngineNavigation; navigationLayout?: EngineNavigationLayout; navigationLabels?: NetworkContextValue["navigationLabels"]; PostArticleRenderer?: NetworkContextValue["PostArticleRenderer"] } = {}) {
  const { router, personId, routes, postPresentation, navigation, navigationLayout, navigationLabels, PostArticleRenderer, ...rest } = options
  return render(ui, {
    wrapper: ({ children }) => (
      <EngineTestWrapper router={router} personId={personId} routes={routes} postPresentation={postPresentation} navigation={navigation} navigationLayout={navigationLayout} navigationLabels={navigationLabels} PostArticleRenderer={PostArticleRenderer}>
        {children}
      </EngineTestWrapper>
    ),
    ...rest,
  })
}
