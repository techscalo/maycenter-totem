import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/maycenter-logo.png";

export const Route = createFileRoute("/gestion/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.session) navigate({ to: "/gestion" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.message);
        toast.success("Bienvenido");
        navigate({ to: "/gestion" });
      } else {
        const { error } = await authClient.signUp.email({ email, password, name: nombre });
        if (error) throw new Error(error.message);
        toast.success("Cuenta creada. Iniciando sesión…");
        navigate({ to: "/gestion" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-[var(--gradient-soft)] p-4">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-[var(--shadow-card)] border p-8">
        <div className="flex items-center gap-3 mb-6">
          <img src={logo} alt="Maycenter" className="h-11 w-11 rounded-xl object-contain" />
          <div>
            <div className="text-lg font-semibold">Maycenter · Gestión</div>
            <div className="text-sm text-muted-foreground">Acceso de personal</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label>Nombre y apellido</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Contraseña</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? "Procesando…" : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              ¿Sos nuevo?{" "}
              <button type="button" className="text-primary underline" onClick={() => setMode("signup")}>
                Crear cuenta
              </button>
            </>
          ) : (
            <>
              ¿Ya tenés cuenta?{" "}
              <button type="button" className="text-primary underline" onClick={() => setMode("login")}>
                Iniciar sesión
              </button>
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:underline">
            ← Volver al tótem
          </Link>
        </div>
      </div>
    </div>
  );
}
