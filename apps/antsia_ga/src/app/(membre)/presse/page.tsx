import { MemberEditorialDirectory } from "@/components/editorial/directory-screen"
import { getAppT } from "@/i18n/server"
export function generateMetadata() { return { title: getAppT().t("editorial:directory.title"), robots: { index: false, follow: false } } }
export default function Page() { return <MemberEditorialDirectory /> }
