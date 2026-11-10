import { PublicCatalogMetadata, PublicCatalogScreen } from "@/components/shops/catalog-public-route"
export const dynamic = "force-dynamic"
type Props = Parameters<typeof PublicCatalogScreen>[0]
export function generateMetadata(props: Props) { return PublicCatalogMetadata({ ...props, provider: true }) }
export default function Page(props: Props) { return PublicCatalogScreen({ ...props, provider: true }) }
