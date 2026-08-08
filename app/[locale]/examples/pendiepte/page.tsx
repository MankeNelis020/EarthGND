import { redirect } from 'next/navigation';

type Props = { params: Promise<{ locale: string }> };

/** Legacy showcase URL → public city sandbox with opleverrapport preview. */
export default async function PendiepteShowcasePage({ params }: Props) {
  const { locale } = await params;
  redirect(`/${locale}/sandbox`);
}
