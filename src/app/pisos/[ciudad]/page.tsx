import { CityPage, cityPageMetadata } from "@/components/seo/city-page";

type Props = { params: Promise<{ ciudad: string }> };

export async function generateMetadata({ params }: Props) {
  return cityPageMetadata("pisos", (await params).ciudad);
}

export default async function Page({ params }: Props) {
  return <CityPage segment="pisos" slug={(await params).ciudad} />;
}
