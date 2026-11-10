import { CityPage, cityPageMetadata } from "@/components/seo/city-page";

type Props = { params: Promise<{ ciudad: string }> };

export async function generateMetadata({ params }: Props) {
  return cityPageMetadata("habitaciones", (await params).ciudad);
}

export default async function Page({ params }: Props) {
  return <CityPage segment="habitaciones" slug={(await params).ciudad} />;
}
