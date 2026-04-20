import { PortfolioPage } from '@/components/portfolio-page';
import { PUBLISHED_REVALIDATE_SECONDS } from '@/sanity/lib/fetch';
import { getPortfolioContent } from '@/sanity/lib/portfolio-content';

export const revalidate = PUBLISHED_REVALIDATE_SECONDS;

export default async function Home() {
  const content = await getPortfolioContent();
  return <PortfolioPage content={content} />;
}
