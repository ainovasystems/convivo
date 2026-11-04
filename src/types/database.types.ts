export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      interests: {
        Row: {
          created_at: string;
          decided_at: string | null;
          from_user: string;
          id: string;
          listing_id: string;
          message: string;
          status: Database["public"]["Enums"]["interest_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          from_user: string;
          id?: string;
          listing_id: string;
          message: string;
          status?: Database["public"]["Enums"]["interest_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          from_user?: string;
          id?: string;
          listing_id?: string;
          message?: string;
          status?: Database["public"]["Enums"]["interest_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interests_from_user_fkey";
            columns: ["from_user"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interests_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_addresses: {
        Row: {
          address_line: string;
          created_at: string;
          floor_door: string | null;
          listing_id: string;
          postal_code: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address_line: string;
          created_at?: string;
          floor_door?: string | null;
          listing_id: string;
          postal_code?: string | null;
          updated_at?: string;
        };
        Update: {
          address_line?: string;
          created_at?: string;
          floor_door?: string | null;
          listing_id?: string;
          postal_code?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_addresses_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: true;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listings: {
        Row: {
          available_from: string | null;
          bathrooms: number | null;
          bedrooms: number | null;
          bills_included: boolean | null;
          city: string | null;
          created_at: string;
          current_flatmates: number | null;
          deposit: number | null;
          description: string;
          furnished: boolean | null;
          id: string;
          kind: Database["public"]["Enums"]["listing_kind"];
          max_budget: number | null;
          min_stay_months: number | null;
          monthly_rent: number | null;
          move_in_date: string | null;
          neighborhood: string | null;
          owner_id: string;
          photos: string[];
          province: string | null;
          published_at: string | null;
          rules: NonNullable<Json>;
          size_m2: number | null;
          status: Database["public"]["Enums"]["listing_status"];
          title: string;
          updated_at: string;
          zones: string[];
        };
        ComputedFields: never;
        Insert: {
          available_from?: string | null;
          bathrooms?: number | null;
          bedrooms?: number | null;
          bills_included?: boolean | null;
          city?: string | null;
          created_at?: string;
          current_flatmates?: number | null;
          deposit?: number | null;
          description?: string;
          furnished?: boolean | null;
          id?: string;
          kind: Database["public"]["Enums"]["listing_kind"];
          max_budget?: number | null;
          min_stay_months?: number | null;
          monthly_rent?: number | null;
          move_in_date?: string | null;
          neighborhood?: string | null;
          owner_id: string;
          photos?: string[];
          province?: string | null;
          published_at?: string | null;
          rules?: NonNullable<Json>;
          size_m2?: number | null;
          status?: Database["public"]["Enums"]["listing_status"];
          title?: string;
          updated_at?: string;
          zones?: string[];
        };
        Update: {
          available_from?: string | null;
          bathrooms?: number | null;
          bedrooms?: number | null;
          bills_included?: boolean | null;
          city?: string | null;
          created_at?: string;
          current_flatmates?: number | null;
          deposit?: number | null;
          description?: string;
          furnished?: boolean | null;
          id?: string;
          kind?: Database["public"]["Enums"]["listing_kind"];
          max_budget?: number | null;
          min_stay_months?: number | null;
          monthly_rent?: number | null;
          move_in_date?: string | null;
          neighborhood?: string | null;
          owner_id?: string;
          photos?: string[];
          province?: string | null;
          published_at?: string | null;
          rules?: NonNullable<Json>;
          size_m2?: number | null;
          status?: Database["public"]["Enums"]["listing_status"];
          title?: string;
          updated_at?: string;
          zones?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "listings_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          interest_id: string;
          sender_id: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          interest_id: string;
          sender_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          interest_id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_interest_id_fkey";
            columns: ["interest_id"];
            isOneToOne: false;
            referencedRelation: "interests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          age_range: Database["public"]["Enums"]["age_range"] | null;
          avatar_url: string | null;
          bio: string | null;
          city: string | null;
          created_at: string;
          display_name: string;
          email_verified: boolean;
          habits: NonNullable<Json>;
          id: string;
          languages: string[];
          occupation: string | null;
          phone_verified: boolean;
          roles: Database["public"]["Enums"]["user_role"][];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          age_range?: Database["public"]["Enums"]["age_range"] | null;
          avatar_url?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          display_name: string;
          email_verified?: boolean;
          habits?: NonNullable<Json>;
          id: string;
          languages?: string[];
          occupation?: string | null;
          phone_verified?: boolean;
          roles?: Database["public"]["Enums"]["user_role"][];
          updated_at?: string;
        };
        Update: {
          age_range?: Database["public"]["Enums"]["age_range"] | null;
          avatar_url?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          display_name?: string;
          email_verified?: boolean;
          habits?: NonNullable<Json>;
          id?: string;
          languages?: string[];
          occupation?: string | null;
          phone_verified?: boolean;
          roles?: Database["public"]["Enums"]["user_role"][];
          updated_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["report_status"];
          target_listing_id: string | null;
          target_message_id: string | null;
          target_review_id: string | null;
          target_user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          target_listing_id?: string | null;
          target_message_id?: string | null;
          target_review_id?: string | null;
          target_user_id?: string | null;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason?: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          target_listing_id?: string | null;
          target_message_id?: string | null;
          target_review_id?: string | null;
          target_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_target_listing_id_fkey";
            columns: ["target_listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_target_message_id_fkey";
            columns: ["target_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_target_review_id_fkey";
            columns: ["target_review_id"];
            isOneToOne: false;
            referencedRelation: "reviews";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_target_user_id_fkey";
            columns: ["target_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          author_id: string;
          body: string | null;
          created_at: string;
          criteria: Json | null;
          deleted_at: string | null;
          deleted_by: string | null;
          deletion_reason: string | null;
          id: string;
          published_at: string;
          rating: number | null;
          relationship: Database["public"]["Enums"]["review_relationship"];
          stay_id: string;
          subject_listing_id: string | null;
          subject_type: Database["public"]["Enums"]["review_subject_type"];
          subject_user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body?: string | null;
          created_at?: string;
          criteria?: Json | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deletion_reason?: string | null;
          id?: string;
          published_at: string;
          rating?: number | null;
          relationship: Database["public"]["Enums"]["review_relationship"];
          stay_id: string;
          subject_listing_id?: string | null;
          subject_type: Database["public"]["Enums"]["review_subject_type"];
          subject_user_id?: string | null;
        };
        Update: {
          author_id?: string;
          body?: string | null;
          created_at?: string;
          criteria?: Json | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deletion_reason?: string | null;
          id?: string;
          published_at?: string;
          rating?: number | null;
          relationship?: Database["public"]["Enums"]["review_relationship"];
          stay_id?: string;
          subject_listing_id?: string | null;
          subject_type?: Database["public"]["Enums"]["review_subject_type"];
          subject_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_subject_listing_id_fkey";
            columns: ["subject_listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_subject_user_id_fkey";
            columns: ["subject_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      stay_participants: {
        Row: {
          added_by: string | null;
          confirmed_at: string | null;
          created_at: string;
          stay_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          added_by?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          stay_id: string;
          user_id: string;
        };
        Update: {
          added_by?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          stay_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stay_participants_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stay_participants_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stay_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      stays: {
        Row: {
          activated_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          end_date: string | null;
          ended_at: string | null;
          guest_confirmed_at: string | null;
          guest_id: string;
          host_confirmed_at: string | null;
          host_id: string;
          id: string;
          interest_id: string | null;
          is_retroactive: boolean;
          listing_id: string;
          proposed_by: string | null;
          start_date: string;
          status: Database["public"]["Enums"]["stay_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          activated_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          end_date?: string | null;
          ended_at?: string | null;
          guest_confirmed_at?: string | null;
          guest_id: string;
          host_confirmed_at?: string | null;
          host_id: string;
          id?: string;
          interest_id?: string | null;
          is_retroactive?: boolean;
          listing_id: string;
          proposed_by?: string | null;
          start_date: string;
          status?: Database["public"]["Enums"]["stay_status"];
          updated_at?: string;
        };
        Update: {
          activated_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          end_date?: string | null;
          ended_at?: string | null;
          guest_confirmed_at?: string | null;
          guest_id?: string;
          host_confirmed_at?: string | null;
          host_id?: string;
          id?: string;
          interest_id?: string | null;
          is_retroactive?: boolean;
          listing_id?: string;
          proposed_by?: string | null;
          start_date?: string;
          status?: Database["public"]["Enums"]["stay_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stays_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stays_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stays_interest_id_fkey";
            columns: ["interest_id"];
            isOneToOne: false;
            referencedRelation: "interests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stays_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stays_proposed_by_fkey";
            columns: ["proposed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_stay_participant: {
        Args: { p_stay_id: string; p_user_id: string };
        Returns: {
          added_by: string | null;
          confirmed_at: string | null;
          created_at: string;
          stay_id: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "stay_participants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      am_i_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      cancel_stay: {
        Args: { p_stay_id: string };
        Returns: {
          activated_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          end_date: string | null;
          ended_at: string | null;
          guest_confirmed_at: string | null;
          guest_id: string;
          host_confirmed_at: string | null;
          host_id: string;
          id: string;
          interest_id: string | null;
          is_retroactive: boolean;
          listing_id: string;
          proposed_by: string | null;
          start_date: string;
          status: Database["public"]["Enums"]["stay_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "stays";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      confirm_stay: {
        Args: { p_stay_id: string };
        Returns: {
          activated_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          end_date: string | null;
          ended_at: string | null;
          guest_confirmed_at: string | null;
          guest_id: string;
          host_confirmed_at: string | null;
          host_id: string;
          id: string;
          interest_id: string | null;
          is_retroactive: boolean;
          listing_id: string;
          proposed_by: string | null;
          start_date: string;
          status: Database["public"]["Enums"]["stay_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "stays";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      confirm_stay_participation: {
        Args: { p_stay_id: string };
        Returns: {
          added_by: string | null;
          confirmed_at: string | null;
          created_at: string;
          stay_id: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "stay_participants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      decline_stay_participation: { Args: { p_stay_id: string }; Returns: undefined };
      delete_review: { Args: { p_reason: string; p_review_id: string }; Returns: undefined };
      end_stay: {
        Args: { p_end_date?: string; p_stay_id: string };
        Returns: {
          activated_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          end_date: string | null;
          ended_at: string | null;
          guest_confirmed_at: string | null;
          guest_id: string;
          host_confirmed_at: string | null;
          host_id: string;
          id: string;
          interest_id: string | null;
          is_retroactive: boolean;
          listing_id: string;
          proposed_by: string | null;
          start_date: string;
          status: Database["public"]["Enums"]["stay_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "stays";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_review_window: {
        Args: { p_stay_id: string };
        Returns: {
          closes_at: string;
          is_open: boolean;
          opens_at: string;
        }[];
      };
      listing_review_stats: {
        Args: { p_listing_id: string };
        Returns: {
          avg_rating: number;
          criteria_avg: Json;
          review_count: number;
        }[];
      };
      profile_review_stats: {
        Args: { p_user_id: string };
        Returns: {
          avg_rating: number;
          criteria_avg: Json;
          relationship: Database["public"]["Enums"]["review_relationship"];
          review_count: number;
        }[];
      };
      review_criteria_for: {
        Args: { p_relationship: Database["public"]["Enums"]["review_relationship"] };
        Returns: string[];
      };
    };
    Enums: {
      age_range: "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+";
      interest_status: "pending" | "accepted" | "declined" | "withdrawn";
      listing_kind: "room" | "flat" | "seeking";
      listing_status: "draft" | "active" | "paused" | "closed";
      report_reason:
        | "spam"
        | "fraud"
        | "offensive"
        | "discrimination"
        | "personal_data"
        | "false_information"
        | "other";
      report_status: "open" | "resolved" | "dismissed";
      review_relationship:
        | "tenant_to_listing"
        | "tenant_to_landlord"
        | "landlord_to_tenant"
        | "flatmate_to_flatmate";
      review_subject_type: "listing" | "user";
      stay_status: "proposed" | "active" | "ended" | "cancelled";
      user_role: "tenant" | "landlord" | "flatmate";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      age_range: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
      interest_status: ["pending", "accepted", "declined", "withdrawn"],
      listing_kind: ["room", "flat", "seeking"],
      listing_status: ["draft", "active", "paused", "closed"],
      report_reason: [
        "spam",
        "fraud",
        "offensive",
        "discrimination",
        "personal_data",
        "false_information",
        "other",
      ],
      report_status: ["open", "resolved", "dismissed"],
      review_relationship: [
        "tenant_to_listing",
        "tenant_to_landlord",
        "landlord_to_tenant",
        "flatmate_to_flatmate",
      ],
      review_subject_type: ["listing", "user"],
      stay_status: ["proposed", "active", "ended", "cancelled"],
      user_role: ["tenant", "landlord", "flatmate"],
    },
  },
} as const;
