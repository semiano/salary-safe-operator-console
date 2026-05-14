import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { setAccessToken } from "../auth/token";
import { apiPostPublic } from "../api/client";

type LoginResponse = {
  access_token: string;
  token_type: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@salarysafe.dev");
  const [password, setPassword] = useState("admin123!");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await apiPostPublic<LoginResponse>("/auth/login", { email, password });
      setAccessToken(response.access_token);
      navigate("/job-listings", { replace: true });
    } catch {
      setError("Login failed. Check credentials and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
      <h2 className="font-display text-2xl">Admin Login</h2>
      <p className="mt-2 text-sm text-slate">Sign in to access protected operator APIs.</p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            className="w-full rounded-lg border border-ink/20 px-3 py-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {error ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

        <button
          className="w-full rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </section>
  );
}
