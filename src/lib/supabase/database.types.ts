// Hand-written in the shape `supabase gen types typescript` produces, for the table created by
// supabase/migrations/20261102000000_charts.sql. Regenerate (or edit by hand) when the schema changes.
// Must stay `type` aliases (not interfaces) so supabase-js's GenericTable constraint accepts them.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      charts: {
        Row: {
          id: string;
          user_id: string;
          kind: 'self' | 'friend';
          name: string;
          note: string | null;
          input: Json;
          birth_date: string;
          birth_time: string | null;
          time_unknown: boolean;
          timezone: string;
          place_label: string | null;
          hd_type: string | null;
          profile: string | null;
          authority: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          kind: 'self' | 'friend';
          name: string;
          note?: string | null;
          input: Json;
          birth_date: string;
          birth_time?: string | null;
          time_unknown?: boolean;
          timezone: string;
          place_label?: string | null;
          hd_type?: string | null;
          profile?: string | null;
          authority?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: 'self' | 'friend';
          name?: string;
          note?: string | null;
          input?: Json;
          birth_date?: string;
          birth_time?: string | null;
          time_unknown?: boolean;
          timezone?: string;
          place_label?: string | null;
          hd_type?: string | null;
          profile?: string | null;
          authority?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type ChartRow = Database['public']['Tables']['charts']['Row'];
export type ChartInsert = Database['public']['Tables']['charts']['Insert'];
export type ChartUpdate = Database['public']['Tables']['charts']['Update'];
