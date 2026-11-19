// Database types for the public schema.
// Regenerate with `pnpm db:types` (needs `pnpm db:start`). This first version was
// written by hand from migration 0001_identity in the same shape the generator uses.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          event_id: string | null;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          event_id?: string | null;
          id?: never;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          event_id?: string | null;
          id?: never;
        };
        Relationships: [];
      };
      org_members: {
        Row: { org_id: string; user_id: string };
        Insert: { org_id: string; user_id: string };
        Update: { org_id?: string; user_id?: string };
        Relationships: [];
      };
      organizations: {
        Row: { id: string; name: string; slug: string };
        Insert: { id?: string; name: string; slug: string };
        Update: { id?: string; name?: string; slug?: string };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          country: string | null;
          email_reminders: boolean;
          gender: string | null;
          github_username: string | null;
          graduation_year: number | null;
          level_of_study: string | null;
          school: string | null;
          timezone: string;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          country?: string | null;
          email_reminders?: boolean;
          gender?: string | null;
          github_username?: string | null;
          graduation_year?: number | null;
          level_of_study?: string | null;
          school?: string | null;
          timezone?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          country?: string | null;
          email_reminders?: boolean;
          gender?: string | null;
          github_username?: string | null;
          graduation_year?: number | null;
          level_of_study?: string | null;
          school?: string | null;
          timezone?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: { created_at: string; platform: string; token: string; user_id: string };
        Insert: { created_at?: string; platform: string; token: string; user_id: string };
        Update: { created_at?: string; platform?: string; token?: string; user_id?: string };
        Relationships: [];
      };
      rate_limit_counters: {
        Row: { count: number; key: string; window_start: string };
        Insert: { count?: number; key: string; window_start: string };
        Update: { count?: number; key?: string; window_start?: string };
        Relationships: [];
      };
      users: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          is_platform_admin: boolean;
          name: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id: string;
          is_platform_admin?: boolean;
          name?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          is_platform_admin?: boolean;
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      application_status:
        'submitted' | 'accepted' | 'waitlisted' | 'rejected' | 'confirmed' | 'declined';
      checkin_method: 'scan' | 'manual';
      event_mode: 'in_person' | 'virtual' | 'hybrid';
      event_status: 'draft' | 'published' | 'live' | 'judging' | 'completed';
      mentor_request_status: 'open' | 'claimed' | 'resolved' | 'cancelled';
      notification_channel: 'email' | 'push';
      notification_status: 'pending' | 'sending' | 'sent' | 'failed' | 'suppressed' | 'superseded';
      sha_state: 'none' | 'pending' | 'captured' | 'unreachable';
      staff_role: 'owner' | 'admin' | 'judge' | 'mentor' | 'volunteer';
      submission_status: 'draft' | 'submitted';
      suppression_reason: 'bounce' | 'complaint';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
