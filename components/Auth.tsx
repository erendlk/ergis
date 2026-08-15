"use client";

import { FormEvent, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AuthProps = {
  embedded?: boolean;
  onAuthenticated?: () => void;
};

export default function Auth({ embedded = false, onAuthenticated }: AuthProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!supabase || !isSupabaseConfigured) {
      setMessage("Supabase bağlantı ayarları bulunamadı.");
      return;
    }

    setLoading(true);
    setMessage("");

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(`Giriş yapılamadı: ${error.message}`);
      } else {
        onAuthenticated?.();
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage(`Kayıt oluşturulamadı: ${error.message}`);
      } else {
        setMessage(
          "Kayıt başarılı. E-posta adresin için doğrulama gerekiyorsa gelen kutunu kontrol et."
        );
      }
    }

    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: embedded ? undefined : "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f7fa",
        padding: embedded ? 0 : 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 10px 35px rgba(0,0,0,0.12)",
        }}
      >
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: 28,
            color: "#0f172a",
          }}
        >
          ŞehirGIS
        </h1>

        <p
          style={{
            margin: "0 0 24px",
            color: "#64748b",
          }}
        >
          {isLogin
            ? "Hesabına giriş yap"
            : "ŞehirGIS hesabını oluştur"}
        </p>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            E-posta
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@mail.com"
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 15,
            }}
          />

          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            Şifre
          </label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="En az 6 karakter"
            required
            minLength={6}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              marginBottom: 20,
              fontSize: 15,
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px",
              border: "none",
              borderRadius: 8,
              background: "#0f766e",
              color: "white",
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading
              ? "İşleniyor..."
              : isLogin
                ? "Giriş Yap"
                : "Kayıt Ol"}
          </button>
        </form>

        {message && (
          <p
            style={{
              marginTop: 16,
              color: "#475569",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setIsLogin(!isLogin);
            setMessage("");
          }}
          style={{
            marginTop: 20,
            width: "100%",
            border: "none",
            background: "transparent",
            color: "#0f766e",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {isLogin
            ? "Hesabın yok mu? Kayıt ol"
            : "Zaten hesabın var mı? Giriş yap"}
        </button>
      </div>
    </div>
  );
}
