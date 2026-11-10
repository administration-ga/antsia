import { PublicOfferMetadata, PublicOfferScreen } from "@/components/shops/catalog-public-route"
export const dynamic = "force-dynamic"
type Props = Parameters<typeof PublicOfferScreen>[0]
export function generateMetadata(props: Props) { return PublicOfferMetadata({ ...props, provider: true }) }
export default function Page(props: Props) { return PublicOfferScreen({ ...props, provider: true }) }
