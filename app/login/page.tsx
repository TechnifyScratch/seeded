"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, ArrowRight } from "lucide-react";
export default function Login() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/live" className="brand">
          Seeded<span>.</span>
        </Link>
        <div className="eyebrow">PRIVATE RESEARCH WORKSPACE</div>
        <h1>
          {needsName ? "Set up your profile." : "Enter your access code."}
        </h1>
        <p>
          {needsName
            ? "Enter the name to save for this access code."
            : "Your invitation to observe the experiment."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const response = await fetch("/api/auth/code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  code,
                  ...(needsName ? { firstName, lastName } : {}),
                }),
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              if (result.needsName) {
                setNeedsName(true);
                return;
              }
              setCode("");
              router.push("/live");
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to sign in.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Access code
            <div className="access-code-input">
              <KeyRound size={17} />
              <input
                type="password"
                name="access-code"
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                minLength={16}
                maxLength={256}
                required
                autoFocus
                value={code}
                placeholder="Paste your access code"
                onChange={(e) => {
                  setCode(e.target.value);
                  setNeedsName(false);
                  setFirstName("");
                  setLastName("");
                }}
              />
            </div>
          </label>
          {needsName && (
            <>
              <label>
                First name
                <input
                  autoComplete="given-name"
                  required
                  maxLength={80}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </label>
              <label>
                Last name
                <input
                  autoComplete="family-name"
                  required
                  maxLength={80}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Opening workspace…"
              : needsName
                ? "Save name and sign in"
                : "Open workspace"}
            <ArrowRight size={15} />
          </button>
        </form>
        <small>
          Access is invitation-only. Your code determines your workspace
          permissions.
        </small>
      </section>
    </main>
  );
}
