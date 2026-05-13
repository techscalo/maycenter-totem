import { ReactNode } from "react";
import logo from "@/assets/maycenter-logo.png";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X } from "lucide-react";

type Props = {
  step?: number;
  totalSteps?: number;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  onCancel?: () => void;
  children: ReactNode;
};

export function KioskShell({ step, totalSteps, title, subtitle, onBack, onCancel, children }: Props) {
  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: "var(--gradient-soft)" }}
    >
      {/* Decorative backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.06]"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 10%, var(--primary) 0, transparent 40%), radial-gradient(circle at 80% 90%, var(--primary-glow) 0, transparent 45%)`,
        }}
      />

      <header className="flex items-center justify-between px-6 md:px-12 py-5">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Maycenter" className="h-12 w-12 rounded-full shadow" />
          <div>
            <div className="text-lg md:text-xl font-bold text-primary leading-tight">Maycenter</div>
            <div className="text-[11px] md:text-xs uppercase tracking-wider text-muted-foreground">
              Clínica Odontológica
            </div>
          </div>
        </div>

        {step != null && totalSteps != null && (
          <div className="hidden md:flex items-center gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-8 rounded-full transition-all ${
                  i < step ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        )}

        {onCancel && (
          <Button variant="ghost" size="lg" onClick={onCancel} className="text-muted-foreground">
            <X className="mr-1 h-5 w-5" /> Cancelar
          </Button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 md:px-12 pb-10">
        <div
          key={`${title}-${step}`}
          className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500"
        >
          {(title || subtitle) && (
            <div className="text-center mb-10 md:mb-14">
              {title && (
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mt-4 text-lg md:text-2xl text-muted-foreground">{subtitle}</p>
              )}
            </div>
          )}
          {children}
        </div>
      </main>

      <footer className="px-6 md:px-12 py-6 flex items-center justify-between">
        {onBack ? (
          <Button variant="outline" size="lg" onClick={onBack} className="text-base h-14 px-6">
            <ArrowLeft className="mr-2 h-5 w-5" /> Volver
          </Button>
        ) : (
          <span />
        )}
        <span className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Maycenter
        </span>
      </footer>
    </div>
  );
}

export function BigOptionButton({
  icon,
  label,
  onClick,
  variant = "default",
}: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-3xl p-8 md:p-10 text-left transition-all duration-300 active:scale-[0.98] hover:-translate-y-1 border-2 ${
        variant === "danger"
          ? "border-destructive/30 bg-card hover:border-destructive hover:shadow-[0_20px_40px_-15px_oklch(0.6_0.22_25/0.4)]"
          : "border-border bg-card hover:border-primary"
      }`}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-6">
        {icon && (
          <div
            className={`shrink-0 grid place-items-center h-20 w-20 md:h-24 md:w-24 rounded-2xl ${
              variant === "danger"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary group-hover:bg-primary/15"
            }`}
          >
            {icon}
          </div>
        )}
        <div className="flex-1">
          <div
            className={`text-2xl md:text-3xl font-semibold ${
              variant === "danger" ? "text-destructive" : "text-foreground"
            }`}
          >
            {label}
          </div>
        </div>
      </div>
    </button>
  );
}