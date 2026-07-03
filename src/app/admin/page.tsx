export default function AdminPage() {
  return (
    <main className="min-h-screen bg-black p-8 text-sm text-white">
      <script
        dangerouslySetInnerHTML={{
          __html: "window.location.replace('/studio');"
        }}
      />
      <p>Redirecting to Studio…</p>
      <p>
        <a href="/studio" style={{ textDecoration: 'underline' }}>
          Open studio
        </a>
      </p>
    </main>
  );
}
