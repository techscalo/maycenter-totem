import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KioskShell, BigOptionButton } from "@/components/KioskShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, CalendarCheck2, Siren, UserRound, Sparkles, CreditCard, Wallet, HelpCircle } from "lucide-react";
import logo from "@/assets/maycenter-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Maycenter — Anunciá tu llegada" },
      { name: "description", content: "Tótem de recepción de la clínica odontológica Maycenter." },
    ],
  }),
  component: KioskPage,
});

type Step = "idle" | "tipo_llegada" | "tipo_paciente" | "tipo_atencion" | "cobertura" | "datos" | "ok";

const COBERTURAS = [
  "OSDE", "OMINT", "Medifé", "Galeno", "IOMA", "DX Medical",
  "AMEBPBA", "OSPJN", "Swiss Medical", "OSPE", "Biomed",
];

function KioskPage() {
  const [step, setStep] = useState<Step>("idle");
  const [tipoLlegada, setTipoLlegada] = useState<string>("");
  const [tipoPaciente, setTipoPaciente] = useState<string>("");
  const [tipoAtencion, setTipoAtencion] = useState<string>("");
  const [cobertura, setCobertura] = useState<string>("");
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [errors, setErrors] = useState<{ nombre?: string; dni?: string }>({});
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep("idle");
    setTipoLlegada(""); setTipoPaciente(""); setTipoAtencion("");
    setCobertura(""); setNombre(""); setDni(""); setErrors({});
  };

  // Auto-return from confirmation after 8s
  useEffect(() => {
    if (step === "ok") {
      const t = setTimeout(reset, 8000);
      return () => clearTimeout(t);
    }
  }, [step]);

  const stepIndex = (
    { idle: 0, tipo_llegada: 1, tipo_paciente: 2, tipo_atencion: 3, cobertura: 4, datos: 5, ok: 6 } as Record<Step, number>
  )[step];

  // ---------- IDLE / WAITING ----------
  if (step === "idle") {
    return (
      <button
        onClick={() => setStep("tipo_llegada")}
        className="min-h-screen w-full flex flex-col items-center justify-center text-left relative overflow-hidden"
        style={{ background: "var(--gradient-brand)" }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 20%, white 0, transparent 35%), radial-gradient(circle at 75% 80%, white 0, transparent 30%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center text-center px-6 animate-in fade-in zoom-in-95 duration-700">
          <img
            src={logo}
            alt="Maycenter"
            className="h-44 w-44 md:h-56 md:w-56 rounded-full shadow-2xl bg-white/10 p-2 animate-pulse"
            style={{ animationDuration: "3s" }}
          />
          <h1 className="mt-10 text-5xl md:text-7xl font-bold text-white tracking-tight">
            Maycenter
          </h1>
          <p className="mt-2 text-lg md:text-2xl text-white/80 uppercase tracking-[0.3em]">
            Clínica Odontológica
          </p>
          <div className="mt-16 px-8 py-4 rounded-full bg-white/15 backdrop-blur border border-white/30">
            <p className="text-white text-xl md:text-3xl font-medium">
              Tocá la pantalla para anunciar tu llegada
            </p>
          </div>
        </div>
      </button>
    );
  }

  // ---------- STEP 1 ----------
  if (step === "tipo_llegada") {
    return (
      <KioskShell
        step={stepIndex} totalSteps={5}
        title="Bienvenido/a a la clínica"
        subtitle="Seleccioná una opción para anunciar tu llegada"
        onCancel={reset}
      >
        <div className="grid gap-5">
          <BigOptionButton
            icon={<CalendarCheck2 className="h-12 w-12 md:h-14 md:w-14" strokeWidth={1.75} />}
            label="Tengo turno"
            onClick={() => { setTipoLlegada("TURNO PROGRAMADO"); setStep("tipo_paciente"); }}
          />
          <BigOptionButton
            icon={<Siren className="h-12 w-12 md:h-14 md:w-14" strokeWidth={1.75} />}
            label="No tengo turno / Urgencia"
            variant="danger"
            onClick={() => { setTipoLlegada("URGENCIA / SIN TURNO"); setStep("tipo_paciente"); }}
          />
        </div>
      </KioskShell>
    );
  }

  // ---------- STEP 2 ----------
  if (step === "tipo_paciente") {
    return (
      <KioskShell
        step={stepIndex} totalSteps={5}
        title="¿Ya sos paciente de la clínica?"
        onBack={() => setStep("tipo_llegada")}
        onCancel={reset}
      >
        <div className="grid gap-5">
          <BigOptionButton
            icon={<UserRound className="h-12 w-12 md:h-14 md:w-14" strokeWidth={1.75} />} label="Ya soy paciente"
            onClick={() => { setTipoPaciente("Paciente existente"); setStep("tipo_atencion"); }}
          />
          <BigOptionButton
            icon={<Sparkles className="h-12 w-12 md:h-14 md:w-14" strokeWidth={1.75} />} label="Es mi primera atención"
            onClick={() => { setTipoPaciente("Primera atención"); setStep("tipo_atencion"); }}
          />
        </div>
      </KioskShell>
    );
  }

  // ---------- STEP 3 ----------
  if (step === "tipo_atencion") {
    return (
      <KioskShell
        step={stepIndex} totalSteps={5}
        title="¿Cómo es tu atención?"
        onBack={() => setStep("tipo_paciente")}
        onCancel={reset}
      >
        <div className="grid gap-5">
          <BigOptionButton
            icon={<CreditCard className="h-12 w-12 md:h-14 md:w-14" strokeWidth={1.75} />} label="Obra social"
            onClick={() => { setTipoAtencion("Obra social"); setStep("cobertura"); }}
          />
          <BigOptionButton
            icon={<Wallet className="h-12 w-12 md:h-14 md:w-14" strokeWidth={1.75} />} label="Particular"
            onClick={() => { setTipoAtencion("Particular"); setCobertura(""); setStep("datos"); }}
          />
        </div>
      </KioskShell>
    );
  }

  // ---------- STEP 4 ----------
  if (step === "cobertura") {
    return (
      <KioskShell
        step={stepIndex} totalSteps={5}
        title="Seleccioná tu cobertura"
        onBack={() => setStep("tipo_atencion")}
        onCancel={reset}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {COBERTURAS.map((c) => (
            <button
              key={c}
              onClick={() => { setCobertura(c); setStep("datos"); }}
              className="rounded-2xl border-2 border-border bg-card p-6 text-xl font-semibold text-foreground hover:border-primary hover:-translate-y-0.5 active:scale-95 transition-all"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              {c}
            </button>
          ))}
          <button
            onClick={() => { setCobertura("Otra obra social"); setStep("datos"); }}
            className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-xl font-semibold text-primary hover:bg-primary/10 active:scale-95 transition-all col-span-2 md:col-span-3 inline-flex items-center justify-center gap-3"
          >
            <HelpCircle className="h-6 w-6" /> Otra obra social
          </button>
        </div>
      </KioskShell>
    );
  }

  // ---------- STEP 5 ----------
  if (step === "datos") {
    const isFirstTime = tipoPaciente === "Primera atención";
    const onSubmit = async () => {
      const e: typeof errors = {};
      if (isFirstTime && !nombre.trim()) e.nombre = "Ingresá tu nombre y apellido.";
      const dniClean = dni.replace(/\D/g, "");
      if (!dniClean) e.dni = "El DNI es obligatorio.";
      else if (dniClean.length < 6) e.dni = "El DNI parece muy corto.";
      setErrors(e);
      if (Object.keys(e).length) return;

      setSaving(true);
      const { error } = await supabase.from("arrivals").insert({
        tipo_llegada: tipoLlegada,
        tipo_paciente: tipoPaciente,
        tipo_atencion: tipoAtencion,
        cobertura: tipoAtencion === "Obra social" ? cobertura : "Particular",
        nombre_apellido: isFirstTime ? nombre.trim() : null,
        dni: dniClean,
        estado: "Pendiente",
      });
      setSaving(false);
      if (error) {
        setErrors({ dni: "No pudimos registrar tu llegada. Intentá nuevamente." });
        return;
      }
      setStep("ok");
    };

    return (
      <KioskShell
        step={stepIndex} totalSteps={5}
        title={isFirstTime ? "Completá tus datos" : "Ingresá tu DNI"}
        subtitle={isFirstTime ? "Necesitamos esta información para registrarte." : "Para confirmar tu llegada."}
        onBack={() => setStep(tipoAtencion === "Obra social" ? "cobertura" : "tipo_atencion")}
        onCancel={reset}
      >
        <div
          className="rounded-3xl bg-card p-6 md:p-10 border border-border space-y-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {isFirstTime && (
            <div className="space-y-2">
              <Label htmlFor="nombre" className="text-lg">Nombre y apellido</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Juan Pérez"
                className="h-16 text-xl"
                autoFocus
              />
              {errors.nombre && <p className="text-destructive text-sm">{errors.nombre}</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="dni" className="text-lg">DNI</Label>
            <Input
              id="dni"
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="Ej: 30123456"
              className="h-16 text-2xl tracking-widest"
              autoFocus={!isFirstTime}
            />
            {errors.dni && <p className="text-destructive text-sm">{errors.dni}</p>}
          </div>
          <Button
            onClick={onSubmit}
            disabled={saving}
            className="w-full h-16 text-xl font-semibold rounded-2xl"
            style={{ background: "var(--gradient-brand)", boxShadow: "var(--shadow-soft)" }}
          >
            {saving ? "Confirmando..." : "Confirmar llegada"}
          </Button>
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {tipoLlegada} · {tipoPaciente} · {tipoAtencion}
          {tipoAtencion === "Obra social" && cobertura ? ` · ${cobertura}` : ""}
        </div>
      </KioskShell>
    );
  }

  // ---------- OK ----------
  return (
    <KioskShell>
      <div
        className="rounded-3xl bg-card p-10 md:p-16 text-center border border-border animate-in zoom-in-95 fade-in duration-500"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <div className="mx-auto h-24 w-24 md:h-28 md:w-28 rounded-full grid place-items-center"
             style={{ background: "var(--gradient-brand)" }}>
          <CheckCircle2 className="h-14 w-14 md:h-16 md:w-16 text-white" />
        </div>
        <h2 className="mt-8 text-3xl md:text-5xl font-bold text-foreground">
          ¡Gracias! Ya avisamos a recepción que llegaste.
        </h2>
        <p className="mt-4 text-lg md:text-2xl text-muted-foreground">
          Por favor aguardá a que te llamen.
        </p>
        <Button
          onClick={reset}
          className="mt-10 h-14 px-10 text-lg rounded-2xl"
          style={{ background: "var(--gradient-brand)" }}
        >
          Finalizar
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">Volvemos al inicio en unos segundos…</p>
      </div>
    </KioskShell>
  );
}
