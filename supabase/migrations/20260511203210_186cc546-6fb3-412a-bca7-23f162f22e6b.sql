
CREATE TABLE public.arrivals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  tipo_llegada text NOT NULL,
  tipo_paciente text NOT NULL,
  tipo_atencion text NOT NULL,
  cobertura text,
  nombre_apellido text,
  dni text NOT NULL,
  estado text NOT NULL DEFAULT 'Pendiente'
);

ALTER TABLE public.arrivals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_insert_arrivals" ON public.arrivals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anyone_select_arrivals" ON public.arrivals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anyone_update_arrivals" ON public.arrivals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anyone_delete_arrivals" ON public.arrivals FOR DELETE TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.arrivals;
ALTER TABLE public.arrivals REPLICA IDENTITY FULL;
