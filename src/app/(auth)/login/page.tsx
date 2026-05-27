"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

// Password login is only available in local dev.
// Set NEXT_PUBLIC_ENABLE_PASSWORD_AUTH=true in .env.local to enable it.
const PASSWORD_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PASSWORD_AUTH === "true";

function FingerprintIcon() {
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading]       = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [sent, setSent]             = useState(false);
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

  // ── Passkey login ─────────────────────────────────────────────────────────
  async function handlePasskey() {
    setLoading(true);
    setLoginError("");
    try {
      // 1. Get authentication challenge from server
      const beginRes = await fetch("/api/passkey/auth/begin", {
        method: "POST",
      });
      if (!beginRes.ok) throw new Error("Error al iniciar passkey");
      const options = await beginRes.json();

      // 2. Trigger platform authenticator (Touch ID / Face ID / Windows Hello)
      const { startAuthentication } = await import(
        "@simplewebauthn/browser"
      );
      const credential = await startAuthentication({ optionsJSON: options });

      // 3. Verify with server
      const finishRes = await fetch("/api/passkey/auth/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential),
      });
      const data = await finishRes.json();
      if (!finishRes.ok || data.error) throw new Error(data.error ?? "Error");

      // 4. Establish Supabase session using the server-generated token
      const supabase = createClient();
      const { error: sessionErr } = await supabase.auth.verifyOtp({
        token_hash: data.token,
        type: "email",
      });
      if (sessionErr) throw sessionErr;

      router.push("/groups");
    } catch (err) {
      const name = (err as Error).name;
      // NotAllowedError = user cancelled — don't show an error
      if (name !== "NotAllowedError") {
        setLoginError("Error con passkey. Intenta con email.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Email / magic-link / password login ───────────────────────────────────
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
            {/* Passkey button — only if platform authenticator is available */}
            {passkeyAvailable && (
              <button
                className={styles.btnPrimary}
                onClick={handlePasskey}
                disabled={loading}
              >
                <FingerprintIcon />
                Continuar con Passkey
              </button>
            )}

            {passkeyAvailable && <p className={styles.divider}>o</p>}

            <div className={styles.emailGroup}>
              <input
                ref={emailRef}
                className={styles.input}
                type="email"
                placeholder="Ingresa tu correo"
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

              <button
                className={styles.btnSecondary}
                onClick={handleLogin}
                disabled={loading}
              >
                {loading
                  ? "Entrando…"
                  : usePassword && PASSWORD_AUTH_ENABLED
                  ? "Iniciar sesión"
                  : "Continuar con email"}
              </button>

              {/* Password toggle — only shown when env enables it */}
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
          </div>
        )}
      </div>
    </main>
  );
}
