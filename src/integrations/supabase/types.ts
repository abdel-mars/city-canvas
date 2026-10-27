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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          avatar_url: string | null
          updated_at: string
          print_link: string | null
          bio: string | null
        }
        Insert: {
          id: string
          username: string
          avatar_url?: string | null
          updated_at?: string
          print_link?: string | null
          bio?: string | null
        }
        Update: {
          id?: string
          username?: string
          avatar_url?: string | null
          updated_at?: string
          print_link?: string | null
          bio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      shares: {
        Row: {
          id: string
          city_name: string
          image_url: string
          settings_json: Json
          created_at: string
          user_id: string | null
          creator_name: string
          creator_email: string | null
          is_published: boolean
          watermark_payload: string | null
          watermark_version: number | null
          city_country: string | null
          shape: string | null
          image_path: string | null
          thumb_url: string | null
          image_purged_at: string | null
        }
        Insert: {
          id?: string
          city_name: string
          image_url: string
          settings_json?: Json
          created_at?: string
          user_id?: string | null
          creator_name?: string
          creator_email?: string | null
          is_published?: boolean
          watermark_payload?: string | null
          watermark_version?: number | null
          city_country?: string | null
          shape?: string | null
          image_path?: string | null
          thumb_url?: string | null
          image_purged_at?: string | null
        }
        Update: {
          id?: string
          city_name?: string
          image_url?: string
          settings_json?: Json
          created_at?: string
          user_id?: string | null
          creator_name?: string
          creator_email?: string | null
          is_published?: boolean
          watermark_payload?: string | null
          watermark_version?: number | null
          city_country?: string | null
          shape?: string | null
          image_path?: string | null
          thumb_url?: string | null
          image_purged_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      social_posts: {
        Row: {
          id: string
          share_id: string
          platform: "instagram" | "pinterest"
          status: "pending" | "posting" | "posted" | "failed" | "needs_review" | "cancelled"
          scheduled_at: string
          next_attempt_at: string | null
          locked_at: string | null
          posted_at: string | null
          title: string | null
          description: string | null
          caption: string | null
          alt_text: string | null
          link_url: string | null
          image_url: string | null
          media_url: string | null
          media_path: string | null
          external_id: string | null
          external_url: string | null
          provider_state: Json
          attempts: number
          click_count: number
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          share_id: string
          platform: "instagram" | "pinterest"
          status?: "pending" | "posting" | "posted" | "failed" | "needs_review" | "cancelled"
          scheduled_at: string
          next_attempt_at?: string | null
          locked_at?: string | null
          posted_at?: string | null
          title?: string | null
          description?: string | null
          caption?: string | null
          alt_text?: string | null
          link_url?: string | null
          image_url?: string | null
          media_url?: string | null
          media_path?: string | null
          external_id?: string | null
          external_url?: string | null
          provider_state?: Json
          attempts?: number
          click_count?: number
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          share_id?: string
          platform?: "instagram" | "pinterest"
          status?: "pending" | "posting" | "posted" | "failed" | "needs_review" | "cancelled"
          scheduled_at?: string
          next_attempt_at?: string | null
          locked_at?: string | null
          posted_at?: string | null
          title?: string | null
          description?: string | null
          caption?: string | null
          alt_text?: string | null
          link_url?: string | null
          image_url?: string | null
          media_url?: string | null
          media_path?: string | null
          external_id?: string | null
          external_url?: string | null
          provider_state?: Json
          attempts?: number
          click_count?: number
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "shares"
            referencedColumns: ["id"]
          }
        ]
      }
      social_clicks: {
        Row: {
          id: number
          social_post_id: string | null
          campaign: string | null
          platform: "instagram" | "pinterest" | null
          clicked_at: string
        }
        Insert: {
          id?: never
          social_post_id?: string | null
          campaign?: string | null
          platform?: "instagram" | "pinterest" | null
          clicked_at?: string
        }
        Update: {
          id?: never
          social_post_id?: string | null
          campaign?: string | null
          platform?: "instagram" | "pinterest" | null
          clicked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_clicks_social_post_id_fkey"
            columns: ["social_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          }
        ]
      }
      social_credentials: {
        Row: {
          platform: "instagram" | "pinterest"
          access_token: string
          refresh_token: string | null
          account_id: string | null
          expires_at: string | null
          metadata: Json
          updated_at: string
        }
        Insert: {
          platform: "instagram" | "pinterest"
          access_token: string
          refresh_token?: string | null
          account_id?: string | null
          expires_at?: string | null
          metadata?: Json
          updated_at?: string
        }
        Update: {
          platform?: "instagram" | "pinterest"
          access_token?: string
          refresh_token?: string | null
          account_id?: string | null
          expires_at?: string | null
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_social_posts: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          share_id: string
          platform: "instagram" | "pinterest"
          status: "pending" | "posting" | "posted" | "failed" | "needs_review" | "cancelled"
          scheduled_at: string
          next_attempt_at: string | null
          locked_at: string | null
          posted_at: string | null
          title: string | null
          description: string | null
          caption: string | null
          alt_text: string | null
          link_url: string | null
          image_url: string | null
          media_url: string | null
          media_path: string | null
          external_id: string | null
          external_url: string | null
          provider_state: Json
          attempts: number
          click_count: number
          last_error: string | null
          created_at: string
          updated_at: string
        }[]
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
