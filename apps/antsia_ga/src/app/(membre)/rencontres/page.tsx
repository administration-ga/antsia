import { MemberPage } from "@/components/member-chrome"
import { PersonalMeetingsEntry } from "@/components/personal-meetings-entry"
import { getAppT } from "@/i18n/server"
export function generateMetadata() { return { title: getAppT().t("personalMeetings:title"), robots: { index: false, follow: false } } }
export default function Page() { return <MemberPage><PersonalMeetingsEntry /></MemberPage> }
