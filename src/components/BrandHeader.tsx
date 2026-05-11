import logo from "@/assets/maycenter-logo.png";

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-4">
      <img src={logo} alt="Maycenter" className="h-14 w-14 rounded-full shadow-md" />
      <div>
        <div className="text-2xl font-bold tracking-tight text-primary">Maycenter</div>
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}