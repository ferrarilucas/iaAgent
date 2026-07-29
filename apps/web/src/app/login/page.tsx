"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"numero" | "codigo">("numero");
  const [erro, setErro] = useState("");

  async function pedirCodigo() {
    setErro("");
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: numero });
    if (error) { setErro(`${error.message ?? "Falha ao enviar"} [${error.status ?? "?"}${error.code ? " " + error.code : ""}]`); return; }
    setEtapa("codigo");
  }

  async function verificar() {
    setErro("");
    const { error } = await authClient.phoneNumber.verify({ phoneNumber: numero, code: codigo });
    if (error) { setErro(`${error.message ?? "Falha na verificacao"} [${error.status ?? "?"}${error.code ? " " + error.code : ""}]`); return; }
    router.push("/app");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Entrar no painel</h1>
      {etapa === "numero" ? (
        <>
          <input className="rounded border p-3" placeholder="Seu numero (ex: 5511999999999)" value={numero} onChange={(e) => setNumero(e.target.value)} />
          <button className="rounded bg-black p-3 text-white" onClick={pedirCodigo}>Enviar codigo no WhatsApp</button>
        </>
      ) : (
        <>
          <input className="rounded border p-3" placeholder="Codigo de 6 digitos" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <button className="rounded bg-black p-3 text-white" onClick={verificar}>Entrar</button>
        </>
      )}
      {erro ? <p className="text-red-600">{erro}</p> : null}
    </main>
  );
}
