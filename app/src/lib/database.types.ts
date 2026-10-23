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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      expense_comments: {
        Row: {
          body: string
          created_at: string
          expense_id: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          expense_id: string
          id?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          expense_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_comments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_events: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json | null
          created_at: string
          expense_id: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          expense_id: string
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          expense_id?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "expense_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_events_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_payers: {
        Row: {
          amount: number
          expense_id: string
          id: number
          user_id: string | null
        }
        Insert: {
          amount: number
          expense_id: string
          id?: never
          user_id?: string | null
        }
        Update: {
          amount?: number
          expense_id?: string
          id?: never
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_payers_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_splits: {
        Row: {
          amount: number
          expense_id: string
          shares: number | null
          user_id: string
        }
        Insert: {
          amount: number
          expense_id: string
          shares?: number | null
          user_id: string
        }
        Update: {
          amount?: number
          expense_id?: string
          shares?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string
          id: string
          latitude: number | null
          longitude: number | null
          payee_name: string | null
          payee_upi: string | null
          place_name: string | null
          receipt_path: string | null
          spent_at: string
          split_method: Database["public"]["Enums"]["split_method"]
          status: Database["public"]["Enums"]["payment_status"]
          trip_id: string
          updated_at: string
          upi_ref: string | null
        }
        Insert: {
          amount: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          payee_name?: string | null
          payee_upi?: string | null
          place_name?: string | null
          receipt_path?: string | null
          spent_at?: string
          split_method?: Database["public"]["Enums"]["split_method"]
          status?: Database["public"]["Enums"]["payment_status"]
          trip_id: string
          updated_at?: string
          upi_ref?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          payee_name?: string | null
          payee_upi?: string | null
          place_name?: string | null
          receipt_path?: string | null
          spent_at?: string
          split_method?: Database["public"]["Enums"]["split_method"]
          status?: Database["public"]["Enums"]["payment_status"]
          trip_id?: string
          updated_at?: string
          upi_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_required: boolean
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          trip_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          action_required?: boolean
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          trip_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          action_required?: boolean
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          trip_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_contributions: {
        Row: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["payment_status"]
          trip_id: string
          upi_app: string | null
          upi_ref: string | null
          user_id: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          trip_id: string
          upi_app?: string | null
          upi_ref?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          trip_id?: string
          upi_app?: string | null
          upi_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_contributions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_contributions_trip_id_user_id_fkey"
            columns: ["trip_id", "user_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["trip_id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_split: Database["public"]["Enums"]["split_method"]
          email: string | null
          full_name: string
          id: string
          language: string
          location_enabled: boolean
          notifications_enabled: boolean
          onboarded: boolean | null
          phone: string | null
          preferred_upi_app: string | null
          updated_at: string
          upi_id: string | null
          upi_name: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_split?: Database["public"]["Enums"]["split_method"]
          email?: string | null
          full_name?: string
          id: string
          language?: string
          location_enabled?: boolean
          notifications_enabled?: boolean
          onboarded?: boolean | null
          phone?: string | null
          preferred_upi_app?: string | null
          updated_at?: string
          upi_id?: string | null
          upi_name?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_split?: Database["public"]["Enums"]["split_method"]
          email?: string | null
          full_name?: string
          id?: string
          language?: string
          location_enabled?: boolean
          notifications_enabled?: boolean
          onboarded?: boolean | null
          phone?: string | null
          preferred_upi_app?: string | null
          updated_at?: string
          upi_id?: string | null
          upi_name?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          from_user: string
          id: string
          paid_at: string | null
          status: Database["public"]["Enums"]["settlement_status"]
          to_user: string
          trip_id: string
          upi_ref: string | null
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string
          from_user: string
          id?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          to_user: string
          trip_id: string
          upi_ref?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          from_user?: string
          id?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          to_user?: string
          trip_id?: string
          upi_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          joined_at: string
          left_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          trip_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          trip_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          default_split: Database["public"]["Enums"]["split_method"]
          end_date: string | null
          ended_at: string | null
          head_id: string
          id: string
          invite_code: string
          money_mode: Database["public"]["Enums"]["money_mode"]
          name: string
          pool_amount_per_person: number
          pool_upi_id: string | null
          settled_at: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_split?: Database["public"]["Enums"]["split_method"]
          end_date?: string | null
          ended_at?: string | null
          head_id: string
          id?: string
          invite_code: string
          money_mode?: Database["public"]["Enums"]["money_mode"]
          name: string
          pool_amount_per_person?: number
          pool_upi_id?: string | null
          settled_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_split?: Database["public"]["Enums"]["split_method"]
          end_date?: string | null
          ended_at?: string | null
          head_id?: string
          id?: string
          invite_code?: string
          money_mode?: Database["public"]["Enums"]["money_mode"]
          name?: string
          pool_amount_per_person?: number
          pool_upi_id?: string | null
          settled_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["payment_status"]
          trip_id: string | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          upi_app: string | null
          upi_ref: string | null
          user_id: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          trip_id?: string | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          upi_app?: string | null
          upi_ref?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          trip_id?: string | null
          type?: Database["public"]["Enums"]["wallet_tx_type"]
          upi_app?: string | null
          upi_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirm_expense_payment: {
        Args: { p_expense_id: string; p_success: boolean; p_upi_ref?: string }
        Returns: undefined
      }
      confirm_pool_contribution: {
        Args: { p_contribution_id: string; p_received: boolean }
        Returns: undefined
      }
      confirm_settlement: {
        Args: { p_received: boolean; p_settlement_id: string }
        Returns: undefined
      }
      confirm_wallet_transaction: {
        Args: {
          p_success: boolean
          p_transaction_id: string
          p_upi_ref?: string
        }
        Returns: undefined
      }
      create_expense: {
        Args: {
          p_amount: number
          p_category?: Database["public"]["Enums"]["expense_category"]
          p_description: string
          p_latitude?: number
          p_longitude?: number
          p_payee_name?: string
          p_payee_upi?: string
          p_payers?: Json
          p_place_name?: string
          p_receipt_path?: string
          p_spent_at?: string
          p_split_method?: Database["public"]["Enums"]["split_method"]
          p_splits?: Json
          p_status?: Database["public"]["Enums"]["payment_status"]
          p_trip_id: string
          p_upi_ref?: string
        }
        Returns: string
      }
      create_trip: {
        Args: {
          p_default_split?: Database["public"]["Enums"]["split_method"]
          p_end_date?: string
          p_money_mode?: Database["public"]["Enums"]["money_mode"]
          p_name: string
          p_pool_amount_per_person?: number
          p_start_date?: string
        }
        Returns: {
          created_at: string
          default_split: Database["public"]["Enums"]["split_method"]
          end_date: string | null
          ended_at: string | null
          head_id: string
          id: string
          invite_code: string
          money_mode: Database["public"]["Enums"]["money_mode"]
          name: string
          pool_amount_per_person: number
          pool_upi_id: string | null
          settled_at: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_expense: { Args: { p_expense_id: string }; Returns: undefined }
      end_trip: { Args: { p_trip_id: string }; Returns: Json }
      end_trip_checklist: { Args: { p_trip_id: string }; Returns: Json }
      get_trip_invite: { Args: { p_invite_code: string }; Returns: Json }
      join_trip: { Args: { p_invite_code: string }; Returns: string }
      leave_trip: { Args: { p_trip_id: string }; Returns: undefined }
      mark_notifications_read: {
        Args: { p_ids?: string[] }
        Returns: undefined
      }
      mark_settlement_paid: {
        Args: { p_settlement_id: string; p_upi_ref?: string }
        Returns: undefined
      }
      my_overview: { Args: never; Returns: Json }
      record_pool_contribution: {
        Args: {
          p_amount: number
          p_trip_id: string
          p_upi_app?: string
          p_upi_ref?: string
        }
        Returns: string
      }
      record_wallet_topup: {
        Args: { p_amount: number; p_upi_app?: string; p_upi_ref?: string }
        Returns: string
      }
      reopen_trip: { Args: { p_trip_id: string }; Returns: undefined }
      send_reminder: {
        Args: { p_kind: string; p_trip_id: string; p_user_id: string }
        Returns: undefined
      }
      trip_balances: {
        Args: { p_trip_id: string }
        Returns: {
          contributed: number
          full_name: string
          net: number
          paid_direct: number
          pool_cash_held: number
          role: Database["public"]["Enums"]["member_role"]
          share: number
          user_id: string
        }[]
      }
      trip_summary: { Args: { p_trip_id: string }; Returns: Json }
      update_expense: {
        Args: {
          p_amount?: number
          p_category?: Database["public"]["Enums"]["expense_category"]
          p_description?: string
          p_expense_id: string
          p_payers?: Json
          p_place_name?: string
          p_receipt_path?: string
          p_spent_at?: string
          p_split_method?: Database["public"]["Enums"]["split_method"]
          p_splits?: Json
        }
        Returns: undefined
      }
      update_trip: {
        Args: {
          p_default_split?: Database["public"]["Enums"]["split_method"]
          p_end_date?: string
          p_money_mode?: Database["public"]["Enums"]["money_mode"]
          p_name?: string
          p_pool_amount_per_person?: number
          p_start_date?: string
          p_trip_id: string
        }
        Returns: {
          created_at: string
          default_split: Database["public"]["Enums"]["split_method"]
          end_date: string | null
          ended_at: string | null
          head_id: string
          id: string
          invite_code: string
          money_mode: Database["public"]["Enums"]["money_mode"]
          name: string
          pool_amount_per_person: number
          pool_upi_id: string | null
          settled_at: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      expense_category:
        | "food"
        | "travel"
        | "stay"
        | "activities"
        | "shopping"
        | "other"
      member_role: "head" | "member"
      money_mode: "pool" | "each_pays" | "both"
      payment_status: "pending" | "confirmed" | "rejected"
      settlement_status: "pending" | "paid" | "confirmed"
      split_method: "equal" | "exact" | "shares"
      trip_status: "active" | "ended" | "settled"
      wallet_tx_type:
        | "topup"
        | "withdrawal"
        | "pool_contribution"
        | "settlement_paid"
        | "settlement_received"
        | "adjustment"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      expense_category: [
        "food",
        "travel",
        "stay",
        "activities",
        "shopping",
        "other",
      ],
      member_role: ["head", "member"],
      money_mode: ["pool", "each_pays", "both"],
      payment_status: ["pending", "confirmed", "rejected"],
      settlement_status: ["pending", "paid", "confirmed"],
      split_method: ["equal", "exact", "shares"],
      trip_status: ["active", "ended", "settled"],
      wallet_tx_type: [
        "topup",
        "withdrawal",
        "pool_contribution",
        "settlement_paid",
        "settlement_received",
        "adjustment",
      ],
    },
  },
} as const
