"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { normalizeBrazilNumber } from "@ia/whatsapp";
import { PilinhaLogo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"numero" | "codigo">("numero");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function pedirCodigo() {
    setErro("");
    setCarregando(true);
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: normalizeBrazilNumber(numero) });
    setCarregando(false);
    if (error) {
      setErro(`${error.message ?? "Falha ao enviar"} [${error.status ?? "?"}${error.code ? " " + error.code : ""}]`);
      return;
    }
    setEtapa("codigo");
  }

  async function verificar() {
    setErro("");
    setCarregando(true);
    const { error } = await authClient.phoneNumber.verify({ phoneNumber: normalizeBrazilNumber(numero), code: codigo });
    setCarregando(false);
    if (error) {
      setErro(`${error.message ?? "Falha na verificação"} [${error.status ?? "?"}${error.code ? " " + error.code : ""}]`);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <PilinhaLogo tagline />
        </div>

        <div className="card p-7">
          {etapa === "numero" ? (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="text-lg font-bold text-fg">Entrar no painel</h1>
                <p className="mt-1 text-sm text-muted">Enviamos um código pelo seu WhatsApp.</p>
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-muted">
                Seu número
                <input
                  className="field"
                  inputMode="tel"
                  autoFocus
                  placeholder="51 99999-9999"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && numero && pedirCodigo()}
                />
              </label>
              <button className="btn-accent w-full" onClick={pedirCodigo} disabled={carregando || !numero}>
                {carregando ? "Enviando…" : "Enviar código no WhatsApp"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="text-lg font-bold text-fg">Confirme o código</h1>
                <p className="mt-1 text-sm text-muted">
                  Enviado para <span className="font-semibold text-fg">{numero}</span>.
                </p>
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-muted">
                Código de 6 dígitos
                <input
                  className="field text-center text-lg font-semibold tracking-[0.4em]"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  placeholder="••••••"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && codigo && verificar()}
                />
              </label>
              <button className="btn-accent w-full" onClick={verificar} disabled={carregando || codigo.length < 4}>
                {carregando ? "Verificando…" : "Entrar"}
              </button>
              <button
                className="text-center text-sm font-medium text-soft transition hover:text-fg"
                onClick={() => {
                  setEtapa("numero");
                  setCodigo("");
                  setErro("");
                }}
              >
                ← Usar outro número
              </button>
            </div>
          )}

          {erro ? (
            <p className="mt-4 rounded-xl px-3 py-2 text-sm font-medium text-danger" style={{ background: "var(--danger-soft)" }}>
              {erro}
            </p>
          ) : null}
        </div>

        <p className="mt-6 text-center text-xs text-soft">Ao entrar, você usa o mesmo número do seu WhatsApp com a pilinha.</p>
      </div>
    </main>
  );
}
