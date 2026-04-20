export { metadata, viewport } from 'next-sanity/studio';

export default function SanityLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ margin: 0, height: '100vh' }}>{children}</div>;
}
