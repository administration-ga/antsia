import { MediaHomeScreen } from "@/components/editorial/desk-screen"
import { getAppT } from "@/i18n/server"
export function generateMetadata() { return { title: getAppT().t("editorial:home.title"), robots: { index: false, follow: false } } }
export default function Page() { return <MediaHomeScreen /> }
