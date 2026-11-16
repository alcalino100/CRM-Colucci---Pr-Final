// lib/relatorios/config-schema.ts
// Validação da configuração do relatório diário (usada pela API de config).

import { z } from "zod"

/**
 * Hora "HH:mm". Aceita também "HH:mm:ss": a coluna do banco é do tipo `time` e devolve "08:00:00",
 * que a tela reenvia ao salvar. Antes só "HH:mm" passava e todo salvamento falhava com
 * "[hora_envio] Formato de hora deve ser HH:mm". O valor é normalizado para "HH:mm".
 */
export const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Formato de hora deve ser HH:mm")
  .transform((valor) => valor.slice(0, 5))

export const configUpdateSchema = z.object({
  ativo: z.boolean().optional(),
  hora_envio: horaSchema.optional(),
  dias_semana: z.array(z.number().int().min(0).max(6)).min(1, "Selecione ao menos um dia da semana").optional(),
  instance_name: z.string().nullable().optional(),
  secoes: z
    .object({
      trafego: z.boolean().optional(),
      automacao: z.boolean().optional(),
      ia: z.boolean().optional(),
      arquivados: z.boolean().optional(),
      tempo: z.boolean().optional(),
    })
    .optional(),
  incluir_gestores_no_tempo: z.boolean().optional(),
  listar_nomes_leads: z.boolean().optional(),
  resumo_ia: z.boolean().optional(),
  limite_tentativa: horaSchema.optional(),
  updated_by: z.string().nullable().optional(),
})

export type ConfigUpdate = z.infer<typeof configUpdateSchema>
