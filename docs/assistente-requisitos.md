# Assistente Virtual (Colucci Conecta 360° – item 5.4): decisões do dono

Fonte: respostas do dono da Colucci ao questionário de 24/11/2026. Este arquivo é a referência para ajustar prompts,
escalações, metas e textos fixos. Materiais de clientes/setor enviados depois devem ser acrescentados aqui.

## Decisões

| # | Tema | Decisão |
|---|------|---------|
| 1 | Nome / apresentação | Apresentar-se como **Betina** (hoje o agente no CRM se chama "Aurora": renomear). Segue a regra de transparência: se o cliente perguntar se é IA, responde a verdade. |
| 2 | Tom de voz | Caloroso e informal no geral; **mais formal em cobrança e reclamação**. |
| 3 | Horário | **24 horas**. Fora do horário comercial, informa que o atendimento humano acontece em horário comercial. |
| 4 | O que resolve sozinha | **A definir junto ao Financeiro e ao Administrativo** (lista de funções por departamento ainda não fechada). |
| 5 | Ações | **Pode abrir chamado** (ex.: manutenção), mas a **confirmação é feita pelo responsável** da área. Não confirma prazo/agendamento por conta própria. |
| 6 | Verificação de identidade | **Mais forte** que os 4 últimos dígitos do CPF (método a definir: ver pendências). |
| 7 | Escalação | Vai para o **responsável da área solicitada**. Prazo de resposta: **1 hora**. Se não responder no prazo, **avisar o Ricardinho**. |
| 8 | Número fora do cadastro | **Anotar** e **encaminhar ao Ricardinho** (não vira lead de vendas). |
| 9 | Após a transferência | **Avisar o Ricardinho repetidamente** até haver retorno, para ele cobrar o funcionário responsável. |
| 10 | Metas | **Responder rápido** e **cobrança automática** (entra na primeira fase). |

## Pendências para fechar com o dono
- Método de verificação "mais forte" (ex.: CPF completo + data de nascimento, código enviado por e-mail/SMS, confirmação de dado do contrato).
- Quem é o responsável de cada área (Financeiro, Administrativo, Manutenção, Locação, Vendas) e o WhatsApp de cada um.
- Número/WhatsApp do Ricardinho e a frequência dos lembretes repetidos (ex.: a cada 15 min até assumirem).
- Lista de funções que a assistente resolve sozinha, por departamento (boleto, informe, reajuste, contrato, status de vistoria, manutenção, vencimentos).
- Cobrança automática: régua (sugestão D+1, D+5, D+10), tom por etapa, canal e quando parar (pagou, negociou, escalou).
- Horário comercial exato (para a mensagem fora do expediente e para contar o prazo de 1 hora).

## Impacto técnico previsto
- Renomear o agente para Betina (prompt, `nomeApresentacao`, textos fixos, gatilhos/metas no banco).
- Tom adaptável: modo formal quando o assunto é cobrança/reclamação.
- Mensagem de horário comercial: 24h com aviso de atendimento humano no expediente.
- Ferramenta de abrir chamado (escrita, com protocolo e status "aguardando confirmação do responsável").
- Escalação com SLA de 1h e **lembretes repetidos ao Ricardinho** (job periódico) enquanto não houver retorno humano.
- Número não cadastrado: registrar e notificar Ricardinho, sem criar lead.
- Verificação reforçada antes de dados sensíveis (boleto, contrato, informe).
- Cobrança automática (régua D+1/D+5/D+10) com parada por pagamento, resposta ou escalação.
