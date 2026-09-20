"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Unable to load Seeded</h1>
        <p>
          The service is unavailable. Check your Supabase configuration and
          migrations, then try again.
        </p>
        <button className="primary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
