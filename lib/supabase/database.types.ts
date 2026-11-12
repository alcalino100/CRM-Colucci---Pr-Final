/**
 * Tipos estáticos do banco de dados Supabase (PostgreSQL)
 * Derivados canonicamente de scripts/*.sql e supabase/migrations/*.sql
 *
 * Mapeia rigorosamente todas as 44 tabelas do banco com tipos fortes para
 * Row, Insert, Update e Relationships conforme exigido pelo @supabase/supabase-js v2.
 */

export type Json = any

export interface GenericRelationship {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

export interface Database {
  public: {
    Tables: {
      ai_agents: {
        Row: {
          id: string
          name: string
          description: string | null
          bot_template: string
          channels: string[]
          response_mode: string
          wait_time_ms: number
          message_cap: number
          api_token: string | null
          api_endpoint: string | null
          model_name: string | null
          system_prompt: string | null
          additional_instructions: string | null
          brand_voice: string | null
          handoff_rules: string | null
          is_active: boolean
          config: Json | null
          account_id: string | null
          created_at: string
          updated_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          bot_template?: string
          channels?: string[]
          response_mode?: string
          wait_time_ms?: number
          message_cap?: number
          api_token?: string | null
          api_endpoint?: string | null
          model_name?: string | null
          system_prompt?: string | null
          additional_instructions?: string | null
          brand_voice?: string | null
          handoff_rules?: string | null
          is_active?: boolean
          config?: Json | null
          account_id?: string | null
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          bot_template?: string
          channels?: string[]
          response_mode?: string
          wait_time_ms?: number
          message_cap?: number
          api_token?: string | null
          api_endpoint?: string | null
          model_name?: string | null
          system_prompt?: string | null
          additional_instructions?: string | null
          brand_voice?: string | null
          handoff_rules?: string | null
          is_active?: boolean
          config?: Json | null
          account_id?: string | null
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      auditoria: {
        Row: {
          id: string
          lead_id: string | null
          lead_nome: string | null
          usuario_nome: string
          tipo: string
          descricao: string
          referencias: string | null
          criado_em: string
          motivo: string | null
          motivo_detalhe: string | null
          [key: string]: any
        }
        Insert: {
          id?: string
          lead_id?: string | null
          lead_nome?: string | null
          usuario_nome: string
          tipo: string
          descricao: string
          referencias?: string | null
          criado_em?: string
          motivo?: string | null
          motivo_detalhe?: string | null
          [key: string]: any
        }
        Update: {
          id?: string
          lead_id?: string | null
          lead_nome?: string | null
          usuario_nome?: string
          tipo?: string
          descricao?: string
          referencias?: string | null
          criado_em?: string
          motivo?: string | null
          motivo_detalhe?: string | null
          [key: string]: any
        }
        Relationships: []
      }
      automation_global_settings: {
        Row: {
          id: string
          organization_id: string
          default_timezone: string
          default_supervisor_user_id: string | null
          default_start_hour: string
          default_end_hour: string
          default_allowed_days: Json
          default_max_daily_sends: number
          default_max_sends_per_lead: number
          default_min_interval_minutes: number
          default_retry_limit: number
          default_retry_interval_minutes: number
          system_enabled: boolean
          created_at: string
          updated_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          organization_id?: string
          default_timezone?: string
          default_supervisor_user_id?: string | null
          default_start_hour?: string
          default_end_hour?: string
          default_allowed_days?: Json
          default_max_daily_sends?: number
          default_max_sends_per_lead?: number
          default_min_interval_minutes?: number
          default_retry_limit?: number
          default_retry_interval_minutes?: number
          system_enabled?: boolean
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          organization_id?: string
          default_timezone?: string
          default_supervisor_user_id?: string | null
          default_start_hour?: string
          default_end_hour?: string
          default_allowed_days?: Json
          default_max_daily_sends?: number
          default_max_sends_per_lead?: number
          default_min_interval_minutes?: number
          default_retry_limit?: number
          default_retry_interval_minutes?: number
          system_enabled?: boolean
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      automation_jobs: {
        Row: {
          id: string
          organization_id: string
          automation_id: string
          lead_id: string
          assigned_agent_id: string | null
          supervisor_user_id: string | null
          status: string
          scheduled_at: string
          validated_at: string | null
          processing_started_at: string | null
          sent_at: string | null
          delivered_at: string | null
          read_at: string | null
          responded_at: string | null
          cancelled_at: string | null
          failed_at: string | null
          next_retry_at: string | null
          attempts: number
          max_attempts: number
          cancellation_reason: string | null
          failure_reason: string | null
          failure_code: string | null
          cancellation_event_id: string | null
          message_content_rendered: string | null
          provider_message_id: string | null
          provider_response: Json | null
          last_human_interaction_at: string | null
          eligible_at: string | null
          locked_at: string | null
          locked_by: string | null
          supervision_status: string | null
          supervision_applied_at: string | null
          supervision_error: string | null
          metadata: Json
          created_at: string
          updated_at: string
          workspace_id: string
          [key: string]: any
        }
        Insert: {
          id?: string
          organization_id?: string
          automation_id: string
          lead_id: string
          assigned_agent_id?: string | null
          supervisor_user_id?: string | null
          status?: string
          scheduled_at: string
          validated_at?: string | null
          processing_started_at?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          read_at?: string | null
          responded_at?: string | null
          cancelled_at?: string | null
          failed_at?: string | null
          next_retry_at?: string | null
          attempts?: number
          max_attempts?: number
          cancellation_reason?: string | null
          failure_reason?: string | null
          failure_code?: string | null
          cancellation_event_id?: string | null
          message_content_rendered?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          last_human_interaction_at?: string | null
          eligible_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          supervision_status?: string | null
          supervision_applied_at?: string | null
          supervision_error?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
          workspace_id?: string
          [key: string]: any
        }
        Update: {
          id?: string
          organization_id?: string
          automation_id?: string
          lead_id?: string
          assigned_agent_id?: string | null
          supervisor_user_id?: string | null
          status?: string
          scheduled_at?: string
          validated_at?: string | null
          processing_started_at?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          read_at?: string | null
          responded_at?: string | null
          cancelled_at?: string | null
          failed_at?: string | null
          next_retry_at?: string | null
          attempts?: number
          max_attempts?: number
          cancellation_reason?: string | null
          failure_reason?: string | null
          failure_code?: string | null
          cancellation_event_id?: string | null
          message_content_rendered?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          last_human_interaction_at?: string | null
          eligible_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          supervision_status?: string | null
          supervision_applied_at?: string | null
          supervision_error?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
          workspace_id?: string
          [key: string]: any
        }
        Relationships: []
      }
      automation_logs: {
        Row: {
          id: string
          organization_id: string
          automation_id: string | null
          job_id: string | null
          lead_id: string | null
          event_type: string
          event_title: string
          event_description: string | null
          previous_status: string | null
          new_status: string | null
          actor_type: string
          actor_user_id: string | null
          related_user_id: string | null
          payload: Json
          created_at: string
          workspace_id: string
          [key: string]: any
        }
        Insert: {
          id?: string
          organization_id?: string
          automation_id?: string | null
          job_id?: string | null
          lead_id?: string | null
          event_type: string
          event_title: string
          event_description?: string | null
          previous_status?: string | null
          new_status?: string | null
          actor_type?: string
          actor_user_id?: string | null
          related_user_id?: string | null
          payload?: Json
          created_at?: string
          workspace_id?: string
          [key: string]: any
        }
        Update: {
          id?: string
          organization_id?: string
          automation_id?: string | null
          job_id?: string | null
          lead_id?: string | null
          event_type?: string
          event_title?: string
          event_description?: string | null
          previous_status?: string | null
          new_status?: string | null
          actor_type?: string
          actor_user_id?: string | null
          related_user_id?: string | null
          payload?: Json
          created_at?: string
          workspace_id?: string
          [key: string]: any
        }
        Relationships: []
      }
      automation_message_templates: {
        Row: {
          id: string
          organization_id: string
          name: string
          channel: string
          content_type: string
          content: string
          variables: Json
          media_url: string | null
          whatsapp_template_name: string | null
          status: string
          created_by: string | null
          created_at: string
          updated_at: string
          workspace_id: string
          [key: string]: any
        }
        Insert: {
          id?: string
          organization_id?: string
          name: string
          channel?: string
          content_type?: string
          content: string
          variables?: Json
          media_url?: string | null
          whatsapp_template_name?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
          workspace_id?: string
          [key: string]: any
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          channel?: string
          content_type?: string
          content?: string
          variables?: Json
          media_url?: string | null
          whatsapp_template_name?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
          workspace_id?: string
          [key: string]: any
        }
        Relationships: []
      }
      automations: {
        Row: {
          id: string
          organization_id: string
          name: string
          slug: string
          description: string | null
          category: string
          status: string
          priority: number
          trigger_type: string
          trigger_config: Json
          conditions: Json
          wait_config: Json
          cancellation_rules: Json
          message_template_id: string | null
          whatsapp_connection_id: string | null
          supervision_enabled: boolean
          supervisor_user_id: string | null
          keep_current_agent: boolean
          create_automatic_note: boolean
          automatic_note_template: string | null
          limits_config: Json
          is_test_mode: boolean
          is_simulation_mode: boolean
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
          workspace_id: string
          [key: string]: any
        }
        Insert: {
          id?: string
          organization_id?: string
          name: string
          slug: string
          description?: string | null
          category?: string
          status?: string
          priority?: number
          trigger_type?: string
          trigger_config?: Json
          conditions?: Json
          wait_config?: Json
          cancellation_rules?: Json
          message_template_id?: string | null
          whatsapp_connection_id?: string | null
          supervision_enabled?: boolean
          supervisor_user_id?: string | null
          keep_current_agent?: boolean
          create_automatic_note?: boolean
          automatic_note_template?: string | null
          limits_config?: Json
          is_test_mode?: boolean
          is_simulation_mode?: boolean
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          workspace_id?: string
          [key: string]: any
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          slug?: string
          description?: string | null
          category?: string
          status?: string
          priority?: number
          trigger_type?: string
          trigger_config?: Json
          conditions?: Json
          wait_config?: Json
          cancellation_rules?: Json
          message_template_id?: string | null
          whatsapp_connection_id?: string | null
          supervision_enabled?: boolean
          supervisor_user_id?: string | null
          keep_current_agent?: boolean
          create_automatic_note?: boolean
          automatic_note_template?: string | null
          limits_config?: Json
          is_test_mode?: boolean
          is_simulation_mode?: boolean
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          workspace_id?: string
          [key: string]: any
        }
        Relationships: []
      }
      conversation_analytics: {
        Row: {
          id: string
          conversation_id: string | null
          ai_id: string | null
          resolved_without_escalation: boolean | null
          response_time_ms: number | null
          user_satisfaction: number | null
          api_cost_usd: number | null
          tokens_used: number | null
          created_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          conversation_id?: string | null
          ai_id?: string | null
          resolved_without_escalation?: boolean | null
          response_time_ms?: number | null
          user_satisfaction?: number | null
          api_cost_usd?: number | null
          tokens_used?: number | null
          created_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          conversation_id?: string | null
          ai_id?: string | null
          resolved_without_escalation?: boolean | null
          response_time_ms?: number | null
          user_satisfaction?: number | null
          api_cost_usd?: number | null
          tokens_used?: number | null
          created_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      conversations_ia: {
        Row: {
          id: string
          ai_id: string
          contact_id: string | null
          channel: string
          external_id: string | null
          status: string
          ai_responding: boolean
          started_at: string
          last_message_at: string
          closed_at: string | null
          escalation_reason: string | null
          last_user_message_at: string | null
          test_mode: boolean
          [key: string]: any
        }
        Insert: {
          id?: string
          ai_id: string
          contact_id?: string | null
          channel: string
          external_id?: string | null
          status?: string
          ai_responding?: boolean
          started_at?: string
          last_message_at?: string
          closed_at?: string | null
          escalation_reason?: string | null
          last_user_message_at?: string | null
          test_mode?: boolean
          [key: string]: any
        }
        Update: {
          id?: string
          ai_id?: string
          contact_id?: string | null
          channel?: string
          external_id?: string | null
          status?: string
          ai_responding?: boolean
          started_at?: string
          last_message_at?: string
          closed_at?: string | null
          escalation_reason?: string | null
          last_user_message_at?: string | null
          test_mode?: boolean
          [key: string]: any
        }
        Relationships: []
      }
      crm_sessoes: {
        Row: {
          id: string
          user_id: string
          inicio_em: string
          fim_em: string | null
          duracao_seg: number
          atualizado_em: string
          [key: string]: any
        }
        Insert: {
          id?: string
          user_id: string
          inicio_em?: string
          fim_em?: string | null
          duracao_seg?: number
          atualizado_em?: string
          [key: string]: any
        }
        Update: {
          id?: string
          user_id?: string
          inicio_em?: string
          fim_em?: string | null
          duracao_seg?: number
          atualizado_em?: string
          [key: string]: any
        }
        Relationships: []
      }
      document_embeddings: {
        Row: {
          id: string
          document_id: string
          embedding: string | null
          chunk_text: string | null
          chunk_order: number | null
          created_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          document_id: string
          embedding?: string | null
          chunk_text?: string | null
          chunk_order?: number | null
          created_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          document_id?: string
          embedding?: string | null
          chunk_text?: string | null
          chunk_order?: number | null
          created_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          name: string
          type: string
          url: string
          content: string | null
          file_size: number | null
          knowledge_base_id: string
          uploaded_at: string
          chunks_count: number
          [key: string]: any
        }
        Insert: {
          id?: string
          name: string
          type: string
          url: string
          content?: string | null
          file_size?: number | null
          knowledge_base_id: string
          uploaded_at?: string
          chunks_count?: number
          [key: string]: any
        }
        Update: {
          id?: string
          name?: string
          type?: string
          url?: string
          content?: string | null
          file_size?: number | null
          knowledge_base_id?: string
          uploaded_at?: string
          chunks_count?: number
          [key: string]: any
        }
        Relationships: []
      }
      escalation_triggers: {
        Row: {
          id: string
          name: string | null
          condition: string
          detection_keywords: string[] | null
          action: string | null
          notification_channels: string[] | null
          assign_to: string | null
          ai_id: string
          created_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          name?: string | null
          condition: string
          detection_keywords?: string[] | null
          action?: string | null
          notification_channels?: string[] | null
          assign_to?: string | null
          ai_id: string
          created_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          name?: string | null
          condition?: string
          detection_keywords?: string[] | null
          action?: string | null
          notification_channels?: string[] | null
          assign_to?: string | null
          ai_id?: string
          created_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      faqs: {
        Row: {
          id: string
          question: string
          answer: string
          knowledge_base_id: string
          created_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          question: string
          answer: string
          knowledge_base_id: string
          created_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          question?: string
          answer?: string
          knowledge_base_id?: string
          created_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      goals: {
        Row: {
          id: string
          name: string
          description: string | null
          type: string
          prompt: string
          questions: string[] | null
          ai_id: string
          is_active: boolean
          config: Json | null
          created_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          type: string
          prompt: string
          questions?: string[] | null
          ai_id: string
          is_active?: boolean
          config?: Json | null
          created_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          type?: string
          prompt?: string
          questions?: string[] | null
          ai_id?: string
          is_active?: boolean
          config?: Json | null
          created_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      justificativas_operacionais: {
        Row: {
          id: string
          lead_id: string
          motivo: string
          observacao: string | null
          etapa: string
          autor_id: string
          autor_nome: string
          criado_em: string
          [key: string]: any
        }
        Insert: {
          id?: string
          lead_id: string
          motivo: string
          observacao?: string | null
          etapa: string
          autor_id: string
          autor_nome: string
          criado_em?: string
          [key: string]: any
        }
        Update: {
          id?: string
          lead_id?: string
          motivo?: string
          observacao?: string | null
          etapa?: string
          autor_id?: string
          autor_nome?: string
          criado_em?: string
          [key: string]: any
        }
        Relationships: []
      }
      knowledge_bases: {
        Row: {
          id: string
          name: string
          description: string | null
          vector_store_id: string | null
          ai_id: string | null
          created_at: string
          updated_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          vector_store_id?: string | null
          ai_id?: string | null
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          vector_store_id?: string | null
          ai_id?: string | null
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      lead_automation_settings: {
        Row: {
          id: string
          lead_id: string
          organization_id: string
          automation_paused: boolean
          automation_paused_reason: string | null
          automation_paused_at: string | null
          automation_paused_by: string | null
          do_not_contact: boolean
          do_not_contact_reason: string | null
          last_automation_sent_at: string | null
          total_automation_messages_sent: number
          created_at: string
          updated_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          lead_id: string
          organization_id?: string
          automation_paused?: boolean
          automation_paused_reason?: string | null
          automation_paused_at?: string | null
          automation_paused_by?: string | null
          do_not_contact?: boolean
          do_not_contact_reason?: string | null
          last_automation_sent_at?: string | null
          total_automation_messages_sent?: number
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          lead_id?: string
          organization_id?: string
          automation_paused?: boolean
          automation_paused_reason?: string | null
          automation_paused_at?: string | null
          automation_paused_by?: string | null
          do_not_contact?: boolean
          do_not_contact_reason?: string | null
          last_automation_sent_at?: string | null
          total_automation_messages_sent?: number
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          nome: string
          telefone: string
          email: string
          referencia_imovel: string
          referencias: Json
          temperatura: string
          ref_proposta: string | null
          ref_fechamento: string | null
          tipo_imovel_vendido: string | null
          meta_campaign_id: string | null
          meta_adset_id: string | null
          meta_ad_id: string | null
          utm_campaign: string | null
          utm_adset: string | null
          utm_ad: string | null
          fbc: string | null
          fbp: string | null
          origem: string | null
          observacoes: string
          status: string
          valor_proposta: number | null
          valor_comissao: number | null
          corretor_id: string | null
          gestor_responsavel: string | null
          arquivado_em: string | null
          fechado_em: string | null
          negociando_em: string | null
          criado_em: string
          atualizado_em: string
          client_ip: string | null
          client_ua: string | null
          workspace_id: string
          telefone_normalizado: string | null
          data_reaparecimento: string | null
          motivo_arquivamento: string | null
          observacao_arquivamento: string | null
          status_anterior: string | null
          reativado_em: string | null
          arquivado_por: string | null
          reativacoes_count: number
          consentimento_contato: boolean
          sem_interesse_permanente: boolean
          tags: string[]
          [key: string]: any
        }
        Insert: {
          id?: string
          nome?: string
          telefone?: string
          email?: string
          referencia_imovel?: string
          referencias?: Json
          temperatura?: string
          ref_proposta?: string | null
          ref_fechamento?: string | null
          tipo_imovel_vendido?: string | null
          meta_campaign_id?: string | null
          meta_adset_id?: string | null
          meta_ad_id?: string | null
          utm_campaign?: string | null
          utm_adset?: string | null
          utm_ad?: string | null
          fbc?: string | null
          fbp?: string | null
          origem?: string | null
          observacoes?: string
          status?: string
          valor_proposta?: number | null
          valor_comissao?: number | null
          corretor_id?: string | null
          gestor_responsavel?: string | null
          arquivado_em?: string | null
          fechado_em?: string | null
          negociando_em?: string | null
          criado_em?: string
          atualizado_em?: string
          client_ip?: string | null
          client_ua?: string | null
          workspace_id?: string
          telefone_normalizado?: string | null
          data_reaparecimento?: string | null
          motivo_arquivamento?: string | null
          observacao_arquivamento?: string | null
          status_anterior?: string | null
          reativado_em?: string | null
          arquivado_por?: string | null
          reativacoes_count?: number
          consentimento_contato?: boolean
          sem_interesse_permanente?: boolean
          tags?: string[]
          [key: string]: any
        }
        Update: {
          id?: string
          nome?: string
          telefone?: string
          email?: string
          referencia_imovel?: string
          referencias?: Json
          temperatura?: string
          ref_proposta?: string | null
          ref_fechamento?: string | null
          tipo_imovel_vendido?: string | null
          meta_campaign_id?: string | null
          meta_adset_id?: string | null
          meta_ad_id?: string | null
          utm_campaign?: string | null
          utm_adset?: string | null
          utm_ad?: string | null
          fbc?: string | null
          fbp?: string | null
          origem?: string | null
          observacoes?: string
          status?: string
          valor_proposta?: number | null
          valor_comissao?: number | null
          corretor_id?: string | null
          gestor_responsavel?: string | null
          arquivado_em?: string | null
          fechado_em?: string | null
          negociando_em?: string | null
          criado_em?: string
          atualizado_em?: string
          client_ip?: string | null
          client_ua?: string | null
          workspace_id?: string
          telefone_normalizado?: string | null
          data_reaparecimento?: string | null
          motivo_arquivamento?: string | null
          observacao_arquivamento?: string | null
          status_anterior?: string | null
          reativado_em?: string | null
          arquivado_por?: string | null
          reativacoes_count?: number
          consentimento_contato?: boolean
          sem_interesse_permanente?: boolean
          tags?: string[]
          [key: string]: any
        }
        Relationships: []
      }
      locacao_contratos: {
        Row: {
          id: string
          lead_id: string | null
          lead_nome: string
          corretor_id: string | null
          corretor_nome: string | null
          imovel_ref: string | null
          valor_aluguel: number
          garantia: string | null
          comissao: number | null
          assinado_em: string
          criado_em: string
          [key: string]: any
        }
        Insert: {
          id?: string
          lead_id?: string | null
          lead_nome: string
          corretor_id?: string | null
          corretor_nome?: string | null
          imovel_ref?: string | null
          valor_aluguel: number
          garantia?: string | null
          comissao?: number | null
          assinado_em?: string
          criado_em?: string
          [key: string]: any
        }
        Update: {
          id?: string
          lead_id?: string | null
          lead_nome?: string
          corretor_id?: string | null
          corretor_nome?: string | null
          imovel_ref?: string | null
          valor_aluguel?: number
          garantia?: string | null
          comissao?: number | null
          assinado_em?: string
          criado_em?: string
          [key: string]: any
        }
        Relationships: []
      }
      locacao_leads: {
        Row: {
          id: string
          nome: string
          telefone: string
          email: string | null
          referencia_imovel: string | null
          referencias: Json
          temperatura: string
          origem: string
          observacoes: string | null
          status: string
          valor_proposta: number | null
          valor_comissao: number | null
          corretor_id: string | null
          gestor_responsavel: string | null
          tipo_imovel_desejado: string | null
          bairros_desejados: Json
          aluguel_max: number | null
          quartos: string | null
          garantia: string | null
          criado_em: string
          atualizado_em: string
          arquivado_em: string | null
          locado_em: string | null
          negociando_em: string | null
          [key: string]: any
        }
        Insert: {
          id?: string
          nome: string
          telefone: string
          email?: string | null
          referencia_imovel?: string | null
          referencias?: Json
          temperatura?: string
          origem?: string
          observacoes?: string | null
          status?: string
          valor_proposta?: number | null
          valor_comissao?: number | null
          corretor_id?: string | null
          gestor_responsavel?: string | null
          tipo_imovel_desejado?: string | null
          bairros_desejados?: Json
          aluguel_max?: number | null
          quartos?: string | null
          garantia?: string | null
          criado_em?: string
          atualizado_em?: string
          arquivado_em?: string | null
          locado_em?: string | null
          negociando_em?: string | null
          [key: string]: any
        }
        Update: {
          id?: string
          nome?: string
          telefone?: string
          email?: string | null
          referencia_imovel?: string | null
          referencias?: Json
          temperatura?: string
          origem?: string
          observacoes?: string | null
          status?: string
          valor_proposta?: number | null
          valor_comissao?: number | null
          corretor_id?: string | null
          gestor_responsavel?: string | null
          tipo_imovel_desejado?: string | null
          bairros_desejados?: Json
          aluguel_max?: number | null
          quartos?: string | null
          garantia?: string | null
          criado_em?: string
          atualizado_em?: string
          arquivado_em?: string | null
          locado_em?: string | null
          negociando_em?: string | null
          [key: string]: any
        }
        Relationships: []
      }
      locacao_visitas: {
        Row: {
          id: string
          lead_id: string
          data: string
          horario: string
          corretor_id: string | null
          gestor_responsavel: string | null
          referencias: string | null
          observacoes: string | null
          criado_em: string
          [key: string]: any
        }
        Insert: {
          id?: string
          lead_id: string
          data: string
          horario: string
          corretor_id?: string | null
          gestor_responsavel?: string | null
          referencias?: string | null
          observacoes?: string | null
          criado_em?: string
          [key: string]: any
        }
        Update: {
          id?: string
          lead_id?: string
          data?: string
          horario?: string
          corretor_id?: string | null
          gestor_responsavel?: string | null
          referencias?: string | null
          observacoes?: string | null
          criado_em?: string
          [key: string]: any
        }
        Relationships: []
      }
      messages_ia: {
        Row: {
          id: string
          conversation_id: string
          role: string
          content: string
          metadata: Json | null
          created_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          conversation_id: string
          role: string
          content: string
          metadata?: Json | null
          created_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: string
          content?: string
          metadata?: Json | null
          created_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      meta_ads: {
        Row: {
          id: string
          nome: string | null
          campanha_id: string | null
          adset_id: string | null
          atualizado_em: string | null
          [key: string]: any
        }
        Insert: {
          id?: string
          nome?: string | null
          campanha_id?: string | null
          adset_id?: string | null
          atualizado_em?: string | null
          [key: string]: any
        }
        Update: {
          id?: string
          nome?: string | null
          campanha_id?: string | null
          adset_id?: string | null
          atualizado_em?: string | null
          [key: string]: any
        }
        Relationships: []
      }
      meta_adsets: {
        Row: {
          id: string
          nome: string | null
          campanha_id: string | null
          atualizado_em: string | null
          [key: string]: any
        }
        Insert: {
          id?: string
          nome?: string | null
          campanha_id?: string | null
          atualizado_em?: string | null
          [key: string]: any
        }
        Update: {
          id?: string
          nome?: string | null
          campanha_id?: string | null
          atualizado_em?: string | null
          [key: string]: any
        }
        Relationships: []
      }
      meta_campanhas: {
        Row: {
          id: string
          nome: string | null
          status: string | null
          corretor_id: string | null
          conta: string | null
          atualizado_em: string | null
          [key: string]: any
        }
        Insert: {
          id?: string
          nome?: string | null
          status?: string | null
          corretor_id?: string | null
          conta?: string | null
          atualizado_em?: string | null
          [key: string]: any
        }
        Update: {
          id?: string
          nome?: string | null
          status?: string | null
          corretor_id?: string | null
          conta?: string | null
          atualizado_em?: string | null
          [key: string]: any
        }
        Relationships: []
      }
      meta_conexao: {
        Row: {
          id: number
          access_token: string
          token_expira_em: string | null
          conectado_por: string | null
          atualizado_em: string
          [key: string]: any
        }
        Insert: {
          id?: number
          access_token: string
          token_expira_em?: string | null
          conectado_por?: string | null
          atualizado_em?: string
          [key: string]: any
        }
        Update: {
          id?: number
          access_token?: string
          token_expira_em?: string | null
          conectado_por?: string | null
          atualizado_em?: string
          [key: string]: any
        }
        Relationships: []
      }
      meta_event_logs: {
        Row: {
          id: string
          event_id: string | null
          event_name: string
          pixel_id: string
          origem: string
          lead_id: string | null
          nome: string | null
          telefone_mascarado: string | null
          valor: number | null
          corretor_id: string | null
          campaign_id: string | null
          adset_id: string | null
          ad_id: string | null
          status: string
          http_status: number | null
          events_received: number | null
          meta_code: string | null
          meta_message: string | null
          event_time: string | null
          criado_em: string
          [key: string]: any
        }
        Insert: {
          id?: string
          event_id?: string | null
          event_name?: string
          pixel_id: string
          origem?: string
          lead_id?: string | null
          nome?: string | null
          telefone_mascarado?: string | null
          valor?: number | null
          corretor_id?: string | null
          campaign_id?: string | null
          adset_id?: string | null
          ad_id?: string | null
          status?: string
          http_status?: number | null
          events_received?: number | null
          meta_code?: string | null
          meta_message?: string | null
          event_time?: string | null
          criado_em?: string
          [key: string]: any
        }
        Update: {
          id?: string
          event_id?: string | null
          event_name?: string
          pixel_id?: string
          origem?: string
          lead_id?: string | null
          nome?: string | null
          telefone_mascarado?: string | null
          valor?: number | null
          corretor_id?: string | null
          campaign_id?: string | null
          adset_id?: string | null
          ad_id?: string | null
          status?: string
          http_status?: number | null
          events_received?: number | null
          meta_code?: string | null
          meta_message?: string | null
          event_time?: string | null
          criado_em?: string
          [key: string]: any
        }
        Relationships: []
      }
      meta_insights_ad_daily: {
        Row: {
          id: string
          campanha_id: string
          adset_id: string | null
          ad_id: string | null
          data: string
          gasto: number
          impressoes: number
          cliques: number
          mensagens_iniciadas: number
          [key: string]: any
        }
        Insert: {
          id?: string
          campanha_id: string
          adset_id?: string | null
          ad_id?: string | null
          data: string
          gasto?: number
          impressoes?: number
          cliques?: number
          mensagens_iniciadas?: number
          [key: string]: any
        }
        Update: {
          id?: string
          campanha_id?: string
          adset_id?: string | null
          ad_id?: string | null
          data?: string
          gasto?: number
          impressoes?: number
          cliques?: number
          mensagens_iniciadas?: number
          [key: string]: any
        }
        Relationships: []
      }
      meta_insights_adset_daily: {
        Row: {
          id: string
          campanha_id: string
          adset_id: string | null
          ad_id: string | null
          data: string
          gasto: number
          impressoes: number
          cliques: number
          mensagens_iniciadas: number
          [key: string]: any
        }
        Insert: {
          id?: string
          campanha_id: string
          adset_id?: string | null
          ad_id?: string | null
          data: string
          gasto?: number
          impressoes?: number
          cliques?: number
          mensagens_iniciadas?: number
          [key: string]: any
        }
        Update: {
          id?: string
          campanha_id?: string
          adset_id?: string | null
          ad_id?: string | null
          data?: string
          gasto?: number
          impressoes?: number
          cliques?: number
          mensagens_iniciadas?: number
          [key: string]: any
        }
        Relationships: []
      }
      meta_insights_campaign_daily: {
        Row: {
          id: string
          campanha_id: string
          adset_id: string | null
          ad_id: string | null
          data: string
          gasto: number
          impressoes: number
          cliques: number
          mensagens_iniciadas: number
          [key: string]: any
        }
        Insert: {
          id?: string
          campanha_id: string
          adset_id?: string | null
          ad_id?: string | null
          data: string
          gasto?: number
          impressoes?: number
          cliques?: number
          mensagens_iniciadas?: number
          [key: string]: any
        }
        Update: {
          id?: string
          campanha_id?: string
          adset_id?: string | null
          ad_id?: string | null
          data?: string
          gasto?: number
          impressoes?: number
          cliques?: number
          mensagens_iniciadas?: number
          [key: string]: any
        }
        Relationships: []
      }
      meta_orcamento: {
        Row: {
          id: number
          teto_mensal: number
          custo_inicial: number
          veiculacao_inicio: number
          veiculacao_fim: number
          contas: number
          atualizado_em: string
          [key: string]: any
        }
        Insert: {
          id?: number
          teto_mensal?: number
          custo_inicial?: number
          veiculacao_inicio?: number
          veiculacao_fim?: number
          contas?: number
          atualizado_em?: string
          [key: string]: any
        }
        Update: {
          id?: number
          teto_mensal?: number
          custo_inicial?: number
          veiculacao_inicio?: number
          veiculacao_fim?: number
          contas?: number
          atualizado_em?: string
          [key: string]: any
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          id: string
          texto: string
          mensagem?: string | null
          tipo: string
          para_role: string | null
          para_usuario_id: string | null
          lead_id: string | null
          lida_por: Json
          criado_em: string
          titulo: string | null
          prioridade: string
          origem: string
          criado_por: string | null
          criado_por_nome: string | null
          modulo: string | null
          workspace_id: string
          [key: string]: any
                }
        Insert: {
          id?: string
          texto?: string | null
          mensagem?: string | null
          tipo?: string
          para_role?: string | null
          para_usuario_id?: string | null
          lead_id?: string | null
          lida_por?: Json
          criado_em?: string
          titulo?: string | null
          prioridade?: string
          origem?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          modulo?: string | null
          workspace_id?: string
          [key: string]: any
                }
        Update: {
          id?: string
          texto?: string
          tipo?: string
          para_role?: string | null
          para_usuario_id?: string | null
          lead_id?: string | null
          lida_por?: Json
          criado_em?: string
          titulo?: string | null
          prioridade?: string
          origem?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          modulo?: string | null
          workspace_id?: string
          [key: string]: any
        }
        Relationships: []
      }
      notificacoes_agendadas: {
        Row: {
          id: string
          titulo: string
          mensagem: string
          prioridade: string
          para_role: string | null
          para_usuario_id: string | null
          agendada_para: string
          status: string
          criado_por: string | null
          criado_por_nome: string | null
          criado_em: string
          enviada_em: string | null
          [key: string]: any
        }
        Insert: {
          id?: string
          titulo: string
          mensagem: string
          prioridade?: string
          para_role?: string | null
          para_usuario_id?: string | null
          agendada_para: string
          status?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          criado_em?: string
          enviada_em?: string | null
          [key: string]: any
        }
        Update: {
          id?: string
          titulo?: string
          mensagem?: string
          prioridade?: string
          para_role?: string | null
          para_usuario_id?: string | null
          agendada_para?: string
          status?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          criado_em?: string
          enviada_em?: string | null
          [key: string]: any
        }
        Relationships: []
      }
      observacoes_qualidade: {
        Row: {
          id: string
          lead_id: string
          autor_id: string | null
          autor_nome: string
          texto: string
          criado_em: string
          [key: string]: any
        }
        Insert: {
          id?: string
          lead_id: string
          autor_id?: string | null
          autor_nome: string
          texto: string
          criado_em?: string
          [key: string]: any
        }
        Update: {
          id?: string
          lead_id?: string
          autor_id?: string | null
          autor_nome?: string
          texto?: string
          criado_em?: string
          [key: string]: any
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          key: string
          label: string
          variant: string
          accent: string
          ordem: number
          visivel_corretor: boolean
          ativo: boolean
          updated_at: string
          workspace_id: string
          [key: string]: any
        }
        Insert: {
          key?: string
          label: string
          variant?: string
          accent?: string
          ordem?: number
          visivel_corretor?: boolean
          ativo?: boolean
          updated_at?: string
          workspace_id?: string
          [key: string]: any
        }
        Update: {
          key?: string
          label?: string
          variant?: string
          accent?: string
          ordem?: number
          visivel_corretor?: boolean
          ativo?: boolean
          updated_at?: string
          workspace_id?: string
          [key: string]: any
        }
        Relationships: []
      }
      rastreio_cliques: {
        Row: {
          id: string
          click_id: string
          criado_em: string
          expira_em: string
          ip: string | null
          user_agent: string | null
          fbc: string | null
          fbp: string | null
          fbclid: string | null
          utm_source: string | null
          utm_medium: string | null
          utm_campaign: string | null
          utm_term: string | null
          utm_content: string | null
          meta_campaign_id: string | null
          meta_adset_id: string | null
          meta_ad_id: string | null
          telefone: string | null
          lead_id: string | null
          consumido: boolean
          [key: string]: any
        }
        Insert: {
          id?: string
          click_id: string
          criado_em?: string
          expira_em?: string
          ip?: string | null
          user_agent?: string | null
          fbc?: string | null
          fbp?: string | null
          fbclid?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          utm_term?: string | null
          utm_content?: string | null
          meta_campaign_id?: string | null
          meta_adset_id?: string | null
          meta_ad_id?: string | null
          telefone?: string | null
          lead_id?: string | null
          consumido?: boolean
          [key: string]: any
        }
        Update: {
          id?: string
          click_id?: string
          criado_em?: string
          expira_em?: string
          ip?: string | null
          user_agent?: string | null
          fbc?: string | null
          fbp?: string | null
          fbclid?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          utm_term?: string | null
          utm_content?: string | null
          meta_campaign_id?: string | null
          meta_adset_id?: string | null
          meta_ad_id?: string | null
          telefone?: string | null
          lead_id?: string | null
          consumido?: boolean
          [key: string]: any
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          id: string
          nome: string
          email: string
          senha_hash: string | null
          role: string
          status: string
          avatar: string | null
          criado_em: string
          workspace_id: string
          [key: string]: any
        }
        Insert: {
          id?: string
          nome: string
          email: string
          senha_hash?: string | null
          role?: string
          status?: string
          avatar?: string | null
          criado_em?: string
          workspace_id?: string
          [key: string]: any
        }
        Update: {
          id?: string
          nome?: string
          email?: string
          senha_hash?: string | null
          role?: string
          status?: string
          avatar?: string | null
          criado_em?: string
          workspace_id?: string
          [key: string]: any
        }
        Relationships: []
      }
      visitas: {
        Row: {
          id: string
          lead_id: string
          data: string
          horario: string
          corretor_id: string | null
          referencias: string | null
          observacoes: string
          workspace_id: string
          [key: string]: any
        }
        Insert: {
          id?: string
          lead_id: string
          data: string
          horario?: string
          corretor_id?: string | null
          referencias?: string | null
          observacoes?: string
          workspace_id?: string
          [key: string]: any
        }
        Update: {
          id?: string
          lead_id?: string
          data?: string
          horario?: string
          corretor_id?: string | null
          referencias?: string | null
          observacoes?: string
          workspace_id?: string
          [key: string]: any
        }
        Relationships: []
      }
      whatsapp_instancias: {
        Row: {
          id: string
          corretor_id: string
          instance_name: string
          numero: string | null
          status: string
          qr_code: string | null
          criado_em: string
          atualizado_em: string
          notif_grupo: string | null
          workspace_id: string
          [key: string]: any
        }
        Insert: {
          id?: string
          corretor_id: string
          instance_name: string
          numero?: string | null
          status?: string
          qr_code?: string | null
          criado_em?: string
          atualizado_em?: string
          notif_grupo?: string | null
          workspace_id?: string
          [key: string]: any
        }
        Update: {
          id?: string
          corretor_id?: string
          instance_name?: string
          numero?: string | null
          status?: string
          qr_code?: string | null
          criado_em?: string
          atualizado_em?: string
          notif_grupo?: string | null
          workspace_id?: string
          [key: string]: any
        }
        Relationships: []
      }
      whatsapp_mensagens: {
        Row: {
          id: string
          instance_name: string
          telefone: string
          nome_contato: string | null
          corpo: string | null
          lead_id: string | null
          veio_de_anuncio: boolean
          anuncio_id: string | null
          anuncio_titulo: string | null
          criado_em: string
          de_mim: boolean
          mensagem_id: string | null
          tipo_midia: string | null
          midia_url: string | null
          mime_type: string | null
          nome_arquivo: string | null
          workspace_id: string
          [key: string]: any
        }
        Insert: {
          id?: string
          instance_name: string
          telefone: string
          nome_contato?: string | null
          corpo?: string | null
          lead_id?: string | null
          veio_de_anuncio?: boolean
          anuncio_id?: string | null
          anuncio_titulo?: string | null
          criado_em?: string
          de_mim?: boolean
          mensagem_id?: string | null
          tipo_midia?: string | null
          midia_url?: string | null
          mime_type?: string | null
          nome_arquivo?: string | null
          workspace_id?: string
          [key: string]: any
        }
        Update: {
          id?: string
          instance_name?: string
          telefone?: string
          nome_contato?: string | null
          corpo?: string | null
          lead_id?: string | null
          veio_de_anuncio?: boolean
          anuncio_id?: string | null
          anuncio_titulo?: string | null
          criado_em?: string
          de_mim?: boolean
          mensagem_id?: string | null
          tipo_midia?: string | null
          midia_url?: string | null
          mime_type?: string | null
          nome_arquivo?: string | null
          workspace_id?: string
          [key: string]: any
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          workspace_id: string
          user_id: string
          role: string
          created_at: string
          [key: string]: any
        }
        Insert: {
          workspace_id: string
          user_id: string
          role?: string
          created_at?: string
          [key: string]: any
        }
        Update: {
          workspace_id?: string
          user_id?: string
          role?: string
          created_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      relatorio_config: {
        Row: {
          id: string
          ativo: boolean
          hora_envio: string
          dias_semana: number[]
          instance_name: string | null
          secoes: Json
          incluir_gestores_no_tempo: boolean
          listar_nomes_leads: boolean
          resumo_ia: boolean
          limite_tentativa: string
          updated_by: string | null
          updated_at: string
          created_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          ativo?: boolean
          hora_envio?: string
          dias_semana?: number[]
          instance_name?: string | null
          secoes?: Json
          incluir_gestores_no_tempo?: boolean
          listar_nomes_leads?: boolean
          resumo_ia?: boolean
          limite_tentativa?: string
          updated_by?: string | null
          updated_at?: string
          created_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          ativo?: boolean
          hora_envio?: string
          dias_semana?: number[]
          instance_name?: string | null
          secoes?: Json
          incluir_gestores_no_tempo?: boolean
          listar_nomes_leads?: boolean
          resumo_ia?: boolean
          limite_tentativa?: string
          updated_by?: string | null
          updated_at?: string
          created_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      relatorio_destinatarios: {
        Row: {
          id: string
          nome: string
          tipo: "numero" | "grupo"
          destino: string
          ativo: boolean
          secoes: Json | null
          created_at: string
          updated_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          nome: string
          tipo: "numero" | "grupo"
          destino: string
          ativo?: boolean
          secoes?: Json | null
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          nome?: string
          tipo?: "numero" | "grupo"
          destino?: string
          ativo?: boolean
          secoes?: Json | null
          created_at?: string
          updated_at?: string
          [key: string]: any
        }
        Relationships: []
      }
      relatorio_envios: {
        Row: {
          id: string
          data_referencia: string
          destinatario_id: string | null
          instance_name: string
          origem: "automatico" | "teste" | "reenvio"
          status: "enviado" | "falhou" | "pulado"
          erro: string | null
          texto: string
          secoes_enviadas: string[]
          metricas: Json
          enviado_em: string
          [key: string]: any
        }
        Insert: {
          id?: string
          data_referencia: string
          destinatario_id?: string | null
          instance_name: string
          origem: "automatico" | "teste" | "reenvio"
          status: "enviado" | "falhou" | "pulado"
          erro?: string | null
          texto: string
          secoes_enviadas?: string[]
          metricas?: Json
          enviado_em?: string
          [key: string]: any
        }
        Update: {
          id?: string
          data_referencia?: string
          destinatario_id?: string | null
          instance_name?: string
          origem?: "automatico" | "teste" | "reenvio"
          status?: "enviado" | "falhou" | "pulado"
          erro?: string | null
          texto?: string
          secoes_enviadas?: string[]
          metricas?: Json
          enviado_em?: string
          [key: string]: any
        }
        Relationships: []
      }
      workspace_settings: {
        Row: {
          id: string
          brand_name: string
          logo_url: string | null
          cor_primaria: string
          links: Json
          updated_at: string
          workspace_id: string
          favicon_url: string | null
          sidebar_bg: string
          [key: string]: any
        }
        Insert: {
          id?: string
          brand_name?: string
          logo_url?: string | null
          cor_primaria?: string
          links?: Json
          updated_at?: string
          workspace_id?: string
          favicon_url?: string | null
          sidebar_bg?: string
          [key: string]: any
        }
        Update: {
          id?: string
          brand_name?: string
          logo_url?: string | null
          cor_primaria?: string
          links?: Json
          updated_at?: string
          workspace_id?: string
          favicon_url?: string | null
          sidebar_bg?: string
          [key: string]: any
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          id: string
          slug: string
          name: string
          active: boolean
          created_at: string
          [key: string]: any
        }
        Insert: {
          id?: string
          slug: string
          name: string
          active?: boolean
          created_at?: string
          [key: string]: any
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          active?: boolean
          created_at?: string
          [key: string]: any
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
