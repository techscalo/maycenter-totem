export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      arrivals: {
        Row: {
          cobertura: string | null
          created_at: string
          dni: string
          estado: string
          id: string
          nombre_apellido: string | null
          tipo_atencion: string
          tipo_llegada: string
          tipo_paciente: string
        }
        Insert: {
          cobertura?: string | null
          created_at?: string
          dni: string
          estado?: string
          id?: string
          nombre_apellido?: string | null
          tipo_atencion: string
          tipo_llegada: string
          tipo_paciente: string
        }
        Update: {
          cobertura?: string | null
          created_at?: string
          dni?: string
          estado?: string
          id?: string
          nombre_apellido?: string | null
          tipo_atencion?: string
          tipo_llegada?: string
          tipo_paciente?: string
        }
        Relationships: []
      }
      nomencladores: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string
          id: string
          monto: number
          obra_social_id: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion: string
          id?: string
          monto?: number
          obra_social_id: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string
          id?: string
          monto?: number
          obra_social_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nomencladores_obra_social_id_fkey"
            columns: ["obra_social_id"]
            isOneToOne: false
            referencedRelation: "obras_sociales"
            referencedColumns: ["id"]
          },
        ]
      }
      obras_sociales: {
        Row: {
          activa: boolean
          created_at: string
          es_particular: boolean
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          es_particular?: boolean
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          es_particular?: boolean
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      odontologos: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          numero_od: string | null
          piso_id: string | null
          sucursal_id: string
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          numero_od?: string | null
          piso_id?: string | null
          sucursal_id: string
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          numero_od?: string | null
          piso_id?: string | null
          sucursal_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "odontologos_piso_id_fkey"
            columns: ["piso_id"]
            isOneToOne: false
            referencedRelation: "pisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odontologos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      pisos: {
        Row: {
          created_at: string
          id: string
          nombre: string
          sucursal_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          sucursal_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          sucursal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pisos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      prestaciones: {
        Row: {
          cantidad: number
          codigo_manual: string | null
          cotizacion_usd: number | null
          created_at: string
          created_by: string | null
          descripcion_manual: string | null
          dni: string
          fecha: string
          id: string
          monto: number
          monto_usd: number | null
          nomenclador_id: string | null
          obra_social_id: string
          observaciones: string | null
          odontologo_id: string
          paciente: string
          piso_id: string | null
          sucursal_id: string
          updated_at: string
        }
        Insert: {
          cantidad?: number
          codigo_manual?: string | null
          cotizacion_usd?: number | null
          created_at?: string
          created_by?: string | null
          descripcion_manual?: string | null
          dni: string
          fecha?: string
          id?: string
          monto?: number
          monto_usd?: number | null
          nomenclador_id?: string | null
          obra_social_id: string
          observaciones?: string | null
          odontologo_id: string
          paciente: string
          piso_id?: string | null
          sucursal_id: string
          updated_at?: string
        }
        Update: {
          cantidad?: number
          codigo_manual?: string | null
          cotizacion_usd?: number | null
          created_at?: string
          created_by?: string | null
          descripcion_manual?: string | null
          dni?: string
          fecha?: string
          id?: string
          monto?: number
          monto_usd?: number | null
          nomenclador_id?: string | null
          obra_social_id?: string
          observaciones?: string | null
          odontologo_id?: string
          paciente?: string
          piso_id?: string | null
          sucursal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prestaciones_nomenclador_id_fkey"
            columns: ["nomenclador_id"]
            isOneToOne: false
            referencedRelation: "nomencladores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestaciones_obra_social_id_fkey"
            columns: ["obra_social_id"]
            isOneToOne: false
            referencedRelation: "obras_sociales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestaciones_odontologo_id_fkey"
            columns: ["odontologo_id"]
            isOneToOne: false
            referencedRelation: "odontologos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestaciones_piso_id_fkey"
            columns: ["piso_id"]
            isOneToOne: false
            referencedRelation: "pisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestaciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          nombre: string | null
          sucursal_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre?: string | null
          sucursal_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string | null
          sucursal_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      sucursales: {
        Row: {
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      user_sucursal: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "administrativo" | "direccion" | "odontologo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "administrativo", "direccion", "odontologo"],
    },
  },
} as const
