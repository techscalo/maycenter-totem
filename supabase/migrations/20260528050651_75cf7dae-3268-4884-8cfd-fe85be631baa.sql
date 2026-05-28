
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'administrativo', 'direccion', 'odontologo');

-- =========================================================
-- SUCURSALES
-- =========================================================
CREATE TABLE public.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sucursales TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sucursales TO authenticated;
GRANT ALL ON public.sucursales TO service_role;
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  nombre text,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- USER ROLES
-- =========================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- has_role security definer function (avoids RLS recursion)
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- helper: is staff (admin or direccion)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','direccion')
  )
$$;

-- helper: get user sucursal
CREATE OR REPLACE FUNCTION public.user_sucursal(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sucursal_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- =========================================================
-- PISOS
-- =========================================================
CREATE TABLE public.pisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sucursal_id, nombre)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pisos TO authenticated;
GRANT ALL ON public.pisos TO service_role;
ALTER TABLE public.pisos ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- OBRAS SOCIALES
-- =========================================================
CREATE TABLE public.obras_sociales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  activa boolean NOT NULL DEFAULT true,
  es_particular boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.obras_sociales TO authenticated;
GRANT ALL ON public.obras_sociales TO service_role;
ALTER TABLE public.obras_sociales ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- ODONTOLOGOS
-- =========================================================
CREATE TABLE public.odontologos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  numero_od text,
  piso_id uuid REFERENCES public.pisos(id) ON DELETE SET NULL,
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  user_id uuid,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.odontologos TO authenticated;
GRANT ALL ON public.odontologos TO service_role;
ALTER TABLE public.odontologos ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- NOMENCLADORES
-- =========================================================
CREATE TABLE public.nomencladores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_social_id uuid NOT NULL REFERENCES public.obras_sociales(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descripcion text NOT NULL,
  monto numeric(12,2) NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_social_id, codigo)
);
CREATE INDEX idx_nomencladores_os ON public.nomencladores(obra_social_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nomencladores TO authenticated;
GRANT ALL ON public.nomencladores TO service_role;
ALTER TABLE public.nomencladores ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- PRESTACIONES
-- =========================================================
CREATE TABLE public.prestaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  paciente text NOT NULL,
  dni text NOT NULL,
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE RESTRICT,
  obra_social_id uuid NOT NULL REFERENCES public.obras_sociales(id) ON DELETE RESTRICT,
  piso_id uuid REFERENCES public.pisos(id) ON DELETE SET NULL,
  odontologo_id uuid NOT NULL REFERENCES public.odontologos(id) ON DELETE RESTRICT,
  nomenclador_id uuid REFERENCES public.nomencladores(id) ON DELETE SET NULL,
  codigo_manual text,
  descripcion_manual text,
  cantidad integer NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  monto numeric(12,2) NOT NULL DEFAULT 0,
  monto_usd numeric(12,2),
  cotizacion_usd numeric(12,2),
  observaciones text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prestaciones_fecha ON public.prestaciones(fecha DESC);
CREATE INDEX idx_prestaciones_sucursal ON public.prestaciones(sucursal_id);
CREATE INDEX idx_prestaciones_os ON public.prestaciones(obra_social_id);
CREATE INDEX idx_prestaciones_odo ON public.prestaciones(odontologo_id);
CREATE INDEX idx_prestaciones_dni ON public.prestaciones(dni);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prestaciones TO authenticated;
GRANT ALL ON public.prestaciones TO service_role;
ALTER TABLE public.prestaciones ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- updated_at trigger fn
-- =========================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_prestaciones_updated BEFORE UPDATE ON public.prestaciones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- Auto-create profile on signup
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nombre)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- profiles: each user reads/updates their own; admin/direccion read all
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- user_roles: user reads own; admin manages
CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- catalogs: all authenticated can read; only admin writes
CREATE POLICY "sucursales_read" ON public.sucursales FOR SELECT TO authenticated USING (true);
CREATE POLICY "sucursales_admin_write" ON public.sucursales FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "pisos_read" ON public.pisos FOR SELECT TO authenticated USING (true);
CREATE POLICY "pisos_admin_write" ON public.pisos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "obras_read" ON public.obras_sociales FOR SELECT TO authenticated USING (true);
CREATE POLICY "obras_admin_write" ON public.obras_sociales FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "odontologos_read" ON public.odontologos FOR SELECT TO authenticated USING (true);
CREATE POLICY "odontologos_admin_write" ON public.odontologos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "nomencladores_read" ON public.nomencladores FOR SELECT TO authenticated USING (true);
CREATE POLICY "nomencladores_admin_write" ON public.nomencladores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- prestaciones
-- staff (admin/direccion) full access
CREATE POLICY "prestaciones_staff_all" ON public.prestaciones FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- administrativo: ve y carga su sucursal
CREATE POLICY "prestaciones_admin_branch_select" ON public.prestaciones FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrativo')
    AND sucursal_id = public.user_sucursal(auth.uid())
  );
CREATE POLICY "prestaciones_admin_branch_insert" ON public.prestaciones FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'administrativo')
    AND sucursal_id = public.user_sucursal(auth.uid())
  );
CREATE POLICY "prestaciones_admin_branch_update" ON public.prestaciones FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'administrativo')
    AND sucursal_id = public.user_sucursal(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(),'administrativo')
    AND sucursal_id = public.user_sucursal(auth.uid())
  );
CREATE POLICY "prestaciones_admin_branch_delete" ON public.prestaciones FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(),'administrativo')
    AND sucursal_id = public.user_sucursal(auth.uid())
  );

-- odontologo: solo sus propias prestaciones
CREATE POLICY "prestaciones_odo_select" ON public.prestaciones FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'odontologo')
    AND odontologo_id IN (SELECT id FROM public.odontologos WHERE user_id = auth.uid())
  );

-- =========================================================
-- SEED: sucursales y obra social PARTICULAR
-- =========================================================
INSERT INTO public.sucursales (nombre) VALUES ('CABA'), ('La Plata');
INSERT INTO public.obras_sociales (nombre, es_particular) VALUES ('PARTICULAR', true);
