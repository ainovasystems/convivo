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
      auth_attempts: {
        Row: {
          created_at: string;
          email_hash: string;
          id: number;
          ip_hash: string;
          kind: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email_hash: string;
          id?: never;
          ip_hash: string;
          kind: string;
        };
        Update: {
          created_at?: string;
          email_hash?: string;
          id?: never;
          ip_hash?: string;
          kind?: string;
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
      contract_inventories: {
        Row: {
          contract_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          landlord_confirmed_at: string | null;
          locked_at: string | null;
          stage: Database["public"]["Enums"]["inventory_stage"];
          tenant_confirmed_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          contract_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          landlord_confirmed_at?: string | null;
          locked_at?: string | null;
          stage: Database["public"]["Enums"]["inventory_stage"];
          tenant_confirmed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          contract_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          landlord_confirmed_at?: string | null;
          locked_at?: string | null;
          stage?: Database["public"]["Enums"]["inventory_stage"];
          tenant_confirmed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contract_inventories_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contract_inventories_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      contracts: {
        Row: {
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          document_hash: string | null;
          document_text: string | null;
          id: string;
          interest_id: string | null;
          kind: Database["public"]["Enums"]["contract_kind"];
          landlord_id: string;
          landlord_signature: string | null;
          landlord_signed_at: string | null;
          listing_id: string | null;
          sent_at: string | null;
          signed_at: string | null;
          status: Database["public"]["Enums"]["contract_status"];
          stay_id: string | null;
          template_version: string;
          tenant_id: string;
          tenant_signature: string | null;
          tenant_signed_at: string | null;
          terms: NonNullable<Json>;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          document_hash?: string | null;
          document_text?: string | null;
          id?: string;
          interest_id?: string | null;
          kind: Database["public"]["Enums"]["contract_kind"];
          landlord_id: string;
          landlord_signature?: string | null;
          landlord_signed_at?: string | null;
          listing_id?: string | null;
          sent_at?: string | null;
          signed_at?: string | null;
          status?: Database["public"]["Enums"]["contract_status"];
          stay_id?: string | null;
          template_version: string;
          tenant_id: string;
          tenant_signature?: string | null;
          tenant_signed_at?: string | null;
          terms?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          document_hash?: string | null;
          document_text?: string | null;
          id?: string;
          interest_id?: string | null;
          kind?: Database["public"]["Enums"]["contract_kind"];
          landlord_id?: string;
          landlord_signature?: string | null;
          landlord_signed_at?: string | null;
          listing_id?: string | null;
          sent_at?: string | null;
          signed_at?: string | null;
          status?: Database["public"]["Enums"]["contract_status"];
          stay_id?: string | null;
          template_version?: string;
          tenant_id?: string;
          tenant_signature?: string | null;
          tenant_signed_at?: string | null;
          terms?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contracts_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contracts_interest_id_fkey";
            columns: ["interest_id"];
            isOneToOne: false;
            referencedRelation: "interests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contracts_landlord_id_fkey";
            columns: ["landlord_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contracts_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contracts_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_reads: {
        Row: {
          interest_id: string;
          last_read_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          interest_id: string;
          last_read_at?: string;
          user_id: string;
        };
        Update: {
          interest_id?: string;
          last_read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_reads_interest_id_fkey";
            columns: ["interest_id"];
            isOneToOne: false;
            referencedRelation: "interests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey";
            columns: ["user_id"];
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
      inventory_items: {
        Row: {
          area: string;
          condition: Database["public"]["Enums"]["item_condition"];
          created_at: string;
          created_by: string | null;
          id: string;
          inventory_id: string;
          name: string;
          notes: string;
          photos: string[];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          area: string;
          condition: Database["public"]["Enums"]["item_condition"];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          inventory_id: string;
          name: string;
          notes?: string;
          photos?: string[];
          updated_at?: string;
        };
        Update: {
          area?: string;
          condition?: Database["public"]["Enums"]["item_condition"];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          inventory_id?: string;
          name?: string;
          notes?: string;
          photos?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_items_inventory_id_fkey";
            columns: ["inventory_id"];
            isOneToOne: false;
            referencedRelation: "contract_inventories";
            referencedColumns: ["id"];
          },
        ];
      };
      legal_notices: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          due_at: string;
          explanation: string;
          good_faith: boolean;
          id: string;
          notifier_email: string;
          notifier_name: string;
          notifier_user_id: string | null;
          reason: string;
          reference: string;
          status: string;
          target_id: string | null;
          target_type: string;
          target_url: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          due_at?: string;
          explanation: string;
          good_faith: boolean;
          id?: string;
          notifier_email: string;
          notifier_name: string;
          notifier_user_id?: string | null;
          reason: string;
          reference?: string;
          status?: string;
          target_id?: string | null;
          target_type: string;
          target_url: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          due_at?: string;
          explanation?: string;
          good_faith?: boolean;
          id?: string;
          notifier_email?: string;
          notifier_name?: string;
          notifier_user_id?: string | null;
          reason?: string;
          reference?: string;
          status?: string;
          target_id?: string | null;
          target_type?: string;
          target_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "legal_notices_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "legal_notices_notifier_user_id_fkey";
            columns: ["notifier_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
      listing_flags: {
        Row: {
          created_at: string;
          details: string;
          id: string;
          listing_id: string;
          reason: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          details: string;
          id?: string;
          listing_id: string;
          reason: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          details?: string;
          id?: string;
          listing_id?: string;
          reason?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_flags_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listing_flags_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      listings: {
        Row: {
          available_from: string | null;
          available_until: string | null;
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
          rental_term: Database["public"]["Enums"]["rental_term"];
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
          available_until?: string | null;
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
          rental_term?: Database["public"]["Enums"]["rental_term"];
          rules?: NonNullable<Json>;
          size_m2?: number | null;
          status?: Database["public"]["Enums"]["listing_status"];
          title?: string;
          updated_at?: string;
          zones?: string[];
        };
        Update: {
          available_from?: string | null;
          available_until?: string | null;
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
          rental_term?: Database["public"]["Enums"]["rental_term"];
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
      moderation_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: number;
          note: string | null;
          target_id: string;
          target_type: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          note?: string | null;
          target_id: string;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          note?: string | null;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          read_at: string | null;
          title: string;
          url: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          read_at?: string | null;
          title: string;
          url?: string | null;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          read_at?: string | null;
          title?: string;
          url?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          bio: string | null;
          birth_year: number | null;
          city: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          email_verified: boolean;
          habits: NonNullable<Json>;
          id: string;
          languages: string[];
          occupation: string | null;
          phone_verified: boolean;
          restored_from: string | null;
          roles: Database["public"]["Enums"]["user_role"][];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          bio?: string | null;
          birth_year?: number | null;
          city?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          email_verified?: boolean;
          habits?: NonNullable<Json>;
          id: string;
          languages?: string[];
          occupation?: string | null;
          phone_verified?: boolean;
          restored_from?: string | null;
          roles?: Database["public"]["Enums"]["user_role"][];
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          bio?: string | null;
          birth_year?: number | null;
          city?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          email_verified?: boolean;
          habits?: NonNullable<Json>;
          id?: string;
          languages?: string[];
          occupation?: string | null;
          phone_verified?: boolean;
          restored_from?: string | null;
          roles?: Database["public"]["Enums"]["user_role"][];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_restored_from_fkey";
            columns: ["restored_from"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
      review_responses: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          review_id: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          review_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          review_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_responses_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_responses_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: true;
            referencedRelation: "reviews";
            referencedColumns: ["id"];
          },
        ];
      };
      review_window_notices: {
        Row: {
          kind: string;
          opens_at: string;
          sent_at: string;
          stay_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          kind: string;
          opens_at: string;
          sent_at?: string;
          stay_id: string;
          user_id: string;
        };
        Update: {
          kind?: string;
          opens_at?: string;
          sent_at?: string;
          stay_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_window_notices_stay_id_fkey";
            columns: ["stay_id"];
            isOneToOne: false;
            referencedRelation: "stays";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_window_notices_user_id_fkey";
            columns: ["user_id"];
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
      user_signals: {
        Row: {
          first_seen_at: string;
          ip_hash: string;
          last_seen_at: string;
          ua_hash: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          first_seen_at?: string;
          ip_hash: string;
          last_seen_at?: string;
          ua_hash: string;
          user_id: string;
        };
        Update: {
          first_seen_at?: string;
          ip_hash?: string;
          last_seen_at?: string;
          ua_hash?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_signals_user_id_fkey";
            columns: ["user_id"];
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
      admin_close_listing: { Args: { p_listing_id: string; p_note: string }; Returns: undefined };
      admin_decide_legal_notice: {
        Args: { p_decision: string; p_note: string; p_notice_id: string };
        Returns: undefined;
      };
      admin_resolve_listing_flag: {
        Args: { p_action: string; p_flag_id: string; p_note: string };
        Returns: undefined;
      };
      admin_returning_account_flags: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          display_name: string;
          negative_reviews: number;
          previous_deleted_at: string;
          previous_profile_id: string;
          profile_id: string;
          shared_device: boolean;
        }[];
      };
      admin_review_flags: {
        Args: Record<PropertyKey, never>;
        Returns: {
          author_id: string;
          review_id: string;
          shared_device: boolean;
          shared_ip: boolean;
          subject_user_id: string;
        }[];
      };
      am_i_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      auth_rate_allowed: {
        Args: { p_email_hash: string; p_ip_hash: string; p_kind: string };
        Returns: boolean;
      };
      auth_rate_failed: { Args: { p_email_hash: string; p_ip_hash: string }; Returns: undefined };
      cancel_contract: {
        Args: { p_contract_id: string };
        Returns: {
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          document_hash: string | null;
          document_text: string | null;
          id: string;
          interest_id: string | null;
          kind: Database["public"]["Enums"]["contract_kind"];
          landlord_id: string;
          landlord_signature: string | null;
          landlord_signed_at: string | null;
          listing_id: string | null;
          sent_at: string | null;
          signed_at: string | null;
          status: Database["public"]["Enums"]["contract_status"];
          stay_id: string | null;
          template_version: string;
          tenant_id: string;
          tenant_signature: string | null;
          tenant_signed_at: string | null;
          terms: NonNullable<Json>;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "contracts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
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
      confirm_inventory: {
        Args: { p_inventory_id: string };
        Returns: {
          contract_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          landlord_confirmed_at: string | null;
          locked_at: string | null;
          stage: Database["public"]["Enums"]["inventory_stage"];
          tenant_confirmed_at: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "contract_inventories";
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
      delete_my_account: { Args: { p_confirm: string }; Returns: undefined };
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
      mark_conversation_read: { Args: { p_interest_id: string }; Returns: undefined };
      my_unread_counts: {
        Args: Record<PropertyKey, never>;
        Returns: {
          interest_id: string;
          unread: number;
        }[];
      };
      profile_lineage: { Args: { p_user_id: string }; Returns: string[] };
      profile_review_stats: {
        Args: { p_user_id: string };
        Returns: {
          avg_rating: number;
          criteria_avg: Json;
          relationship: Database["public"]["Enums"]["review_relationship"];
          review_count: number;
        }[];
      };
      record_signal: { Args: { p_ip_hash: string; p_ua_hash: string }; Returns: undefined };
      review_criteria_for: {
        Args: { p_relationship: Database["public"]["Enums"]["review_relationship"] };
        Returns: string[];
      };
      review_window_notices_due: {
        Args: Record<PropertyKey, never>;
        Returns: {
          closes_at: string;
          kind: string;
          listing_title: string;
          opens_at: string;
          stay_id: string;
          user_id: string;
        }[];
      };
      send_contract: {
        Args: { p_contract_id: string; p_document_text: string };
        Returns: {
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          document_hash: string | null;
          document_text: string | null;
          id: string;
          interest_id: string | null;
          kind: Database["public"]["Enums"]["contract_kind"];
          landlord_id: string;
          landlord_signature: string | null;
          landlord_signed_at: string | null;
          listing_id: string | null;
          sent_at: string | null;
          signed_at: string | null;
          status: Database["public"]["Enums"]["contract_status"];
          stay_id: string | null;
          template_version: string;
          tenant_id: string;
          tenant_signature: string | null;
          tenant_signed_at: string | null;
          terms: NonNullable<Json>;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "contracts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      sign_contract: {
        Args: { p_contract_id: string; p_document_hash: string; p_full_name: string };
        Returns: {
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          document_hash: string | null;
          document_text: string | null;
          id: string;
          interest_id: string | null;
          kind: Database["public"]["Enums"]["contract_kind"];
          landlord_id: string;
          landlord_signature: string | null;
          landlord_signed_at: string | null;
          listing_id: string | null;
          sent_at: string | null;
          signed_at: string | null;
          status: Database["public"]["Enums"]["contract_status"];
          stay_id: string | null;
          template_version: string;
          tenant_id: string;
          tenant_signature: string | null;
          tenant_signed_at: string | null;
          terms: NonNullable<Json>;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "contracts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      submit_legal_notice: {
        Args: {
          p_email_hash: string;
          p_explanation: string;
          p_good_faith: boolean;
          p_ip_hash: string;
          p_notifier_email: string;
          p_notifier_name: string;
          p_reason: string;
          p_target_id: string;
          p_target_type: string;
          p_target_url: string;
        };
        Returns: string;
      };
    };
    Enums: {
      contract_kind: "room" | "flat_habitual" | "flat_seasonal";
      contract_status: "draft" | "sent" | "signed" | "cancelled";
      interest_status: "pending" | "accepted" | "declined" | "withdrawn";
      inventory_stage: "entry" | "exit";
      item_condition: "new" | "good" | "worn" | "damaged";
      listing_kind: "room" | "flat" | "seeking";
      listing_status: "draft" | "active" | "paused" | "closed";
      rental_term: "indefinite" | "academic_year" | "fixed";
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
      contract_kind: ["room", "flat_habitual", "flat_seasonal"],
      contract_status: ["draft", "sent", "signed", "cancelled"],
      interest_status: ["pending", "accepted", "declined", "withdrawn"],
      inventory_stage: ["entry", "exit"],
      item_condition: ["new", "good", "worn", "damaged"],
      listing_kind: ["room", "flat", "seeking"],
      listing_status: ["draft", "active", "paused", "closed"],
      rental_term: ["indefinite", "academic_year", "fixed"],
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
