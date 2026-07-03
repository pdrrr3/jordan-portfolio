import { PortfolioPage } from '@/components/portfolio-page';
import { getPortfolioContent } from '@/sanity/lib/portfolio-content';

// Next segment config must be a literal, not an imported constant.
export const revalidate = 3600;

export default async function Home() {
  const content = await getPortfolioContent();
  return <PortfolioPage content={content} />;
}
