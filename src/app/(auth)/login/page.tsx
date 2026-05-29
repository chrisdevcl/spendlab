"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

// Password login is only available in local dev.
// Set NEXT_PUBLIC_ENABLE_PASSWORD_AUTH=true in .env.local to enable it.
const PASSWORD_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PASSWORD_AUTH === "true";

function PasskeyIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 10a2 2 0 0 0-2 2c0 1.7 1.08 3.15 2.6 3.68" />
      <path d="M12 6a6 6 0 0 1 6 6c0 1.37-.45 2.63-1.2 3.65" />
      <path d="M12 6a6 6 0 0 0-6 6c0 3.31 2.69 6 6 6" />
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07" />
      <path d="M12 2c5.52 0 10 4.48 10 10 0 1.45-.31 2.82-.86 4.06" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]             = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("email") ?? "";
  });
  const [password, setPassword]       = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [loginError, setLoginError]   = useState("");
  const [loading, setLoading]         = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [sent, setSent]               = useState(false);
  const emailRef    = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      typeof PublicKeyCredential !== "undefined"
    ) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(setPasskeyAvailable)
        .catch(() => setPasskeyAvailable(false));
    }
  }, []);

  useEffect(() => {
    if (usePassword) {
      setTimeout(() => passwordRef.current?.focus(), 40);
    }
  }, [usePassword]);

  // ── Passkey login / signup ────────────────────────────────────────────────
  // Handles both cases with one button:
  //   mode "authenticate" → user has passkeys → sign in
  //   mode "register"     → no passkeys yet  → create passkey (+ account if new)
  async function handlePasskey() {
    const trimmed = email.trim();
    if (!trimmed) {
      emailRef.current?.focus();
      return;
    }
    setLoading(true);
    setLoginError("");
    try {
      // 1. Ask server: authenticate or register?
      const beginRes = await fetch("/api/passkey/auth/begin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!beginRes.ok) {
        const d = await beginRes.json();
        setLoginError(d.error ?? "Error con passkey. Intenta con magic link.");
        return;
      }
      const { mode, ...options } = await beginRes.json();

      let token: string;

      if (mode === "register") {
        // ── New user or user without passkeys: create a passkey ────────────
        let credential;
        try {
          const { startRegistration } = await import("@simplewebauthn/browser");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          credential = await startRegistration({ optionsJSON: options as any });
        } catch (err) {
          const name = (err as Error).name;
          if (name === "InvalidStateError") {
            setLoginError("Este dispositivo ya tiene una passkey. Intenta con magic link.");
          } else if (name !== "NotAllowedError") {
            setLoginError("Error al crear passkey. Intenta con magic link.");
          }
          return;
        }

        const setupRes = await fetch("/api/passkey/auth/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credential),
        });
        const setupData = await setupRes.json();
        if (!setupRes.ok || setupData.error) {
          setLoginError(setupData.error ?? "Error al registrar passkey.");
          return;
        }
        token = setupData.token;

      } else {
        // ── Existing user: authenticate with passkey ───────────────────────
        let credential;
        try {
          const { startAuthentication } = await import("@simplewebauthn/browser");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          credential = await startAuthentication({ optionsJSON: options as any });
        } catch (err) {
          // NotAllowedError = user cancelled — show nothing
          if ((err as Error).name !== "NotAllowedError") {
            setLoginError("Error con passkey. Intenta con magic link.");
          }
          return;
        }

        const finishRes = await fetch("/api/passkey/auth/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credential),
        });
        const finishData = await finishRes.json();
        if (!finishRes.ok || finishData.error) {
          setLoginError(finishData.error ?? "Error con passkey. Intenta con magic link.");
          return;
        }
        token = finishData.token;
      }

      // 2. Establish Supabase session with the token from the server
      const supabase = createClient();
      const { error: sessionErr } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: "magiclink",
      });
      if (sessionErr) {
        setLoginError("Error al crear sesión. Intenta con magic link.");
        return;
      }

      router.push("/groups");
    } finally {
      setLoading(false);
    }
  }

  // ── Magic link / password login ───────────────────────────────────────────
  async function handleLogin() {
    const trimmed = email.trim();
    if (!trimmed) {
      emailRef.current?.focus();
      return;
    }
    setLoginError("");
    setLoading(true);
    const supabase = createClient();

    if (usePassword && PASSWORD_AUTH_ENABLED) {
      if (!password) {
        setLoginError("Ingresa tu contraseña.");
        setLoading(false);
        passwordRef.current?.focus();
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      setLoading(false);
      if (error) {
        setLoginError("Correo o contraseña incorrectos.");
      } else {
        router.push("/groups");
      }
    } else {
      // Magic link (default in production)
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setLoading(false);
      if (!error) setSent(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleLogin();
  }

  const hasEmail = email.trim().length > 0;

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.hero}>
          <p className={styles.eyebrow}>SpendLab</p>
          <h1 className={styles.title}>Lleva las cuentas sin drama.</h1>
        </div>

        {sent ? (
          <div className={styles.sent}>
            <p className={styles.sentTitle}>Revisa tu correo</p>
            <p className={styles.sentBody}>
              Te enviamos un enlace de acceso a{" "}
              <strong>{email.trim()}</strong>
            </p>
          </div>
        ) : (
          <div className={styles.actions}>
            {/* ── Email field ───────────────────────────────────────── */}
            <div className={styles.emailGroup}>
              <p className={styles.fieldLabel}>Tu correo</p>
              <input
                ref={emailRef}
                className={styles.input}
                type="email"
                placeholder="hola@correo.cl"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setLoginError("");
                }}
                onKeyDown={handleKeyDown}
                autoComplete="email"
                inputMode="email"
                disabled={loading}
              />

              {/* Password field — only if toggle is on AND env enables it */}
              {usePassword && PASSWORD_AUTH_ENABLED && (
                <input
                  ref={passwordRef}
                  className={styles.input}
                  type="password"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLoginError("");
                  }}
                  onKeyDown={handleKeyDown}
                  autoComplete="current-password"
                  disabled={loading}
                />
              )}

              {loginError && (
                <p className={styles.fieldError}>{loginError}</p>
              )}
            </div>

            {/* ── Passkey button — only if platform authenticator available ── */}
            {passkeyAvailable && (
              <button
                className={styles.btnPrimary}
                onClick={handlePasskey}
                disabled={loading}
              >
                {loading
                  ? <span className={styles.spinner} />
                  : <PasskeyIcon />}
                {loading ? "Verificando…" : "Continuar con Passkey"}
              </button>
            )}

            {/* ── Magic link / password button ──────────────────────────── */}
            <button
              className={styles.btnSecondary}
              onClick={handleLogin}
              disabled={loading}
            >
              {loading
                ? <span className={styles.spinnerMuted} />
                : <EnvelopeIcon />}
              {loading
                ? "Enviando…"
                : usePassword && PASSWORD_AUTH_ENABLED
                ? "Iniciar sesión"
                : "Enviar enlace mágico"}
            </button>

            {/* ── Hint when no email entered ────────────────────────────── */}
            {!hasEmail && !loading && (
              <p className={styles.hint}>Escribe tu correo para continuar.</p>
            )}

            {/* ── Password toggle — only shown when env enables it ──────── */}
            {PASSWORD_AUTH_ENABLED && (
              <button
                className={styles.toggleMode}
                onClick={() => {
                  setUsePassword((p) => !p);
                  setLoginError("");
                }}
                disabled={loading}
                type="button"
              >
                {usePassword
                  ? "Usar magic link en su lugar"
                  : "Usar contraseña en su lugar"}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
