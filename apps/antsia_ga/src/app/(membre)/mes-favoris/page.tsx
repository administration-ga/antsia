import { SavedOffersScreen } from "@/components/shops/saved-offers-screen"
import { getAppT } from "@/i18n/server"
export function generateMetadata() { return { title: getAppT().t("shops:saved.title"), robots: { index: false, follow: false } } }
export default function Page() { return <SavedOffersScreen /> }
