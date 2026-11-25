# WhatsApp Oficial (Meta Cloud API) no CRM

Convive com a Evolution: os corretores seguem na Evolution; a API oficial é um canal novo (disparos em volume, cobrança, Betina).
Conversas oficiais usam `instance_name = "oficial:<phone_number_id>"` em `whatsapp_mensagens` e aparecem no Inbox (seletor de instância, “(API oficial)”).

## O que já existe (fase 1)
- Webhook `/api/whatsapp/oficial/webhook`: verificação (`hub.verify_token`) e eventos protegidos por assinatura `x-hub-signature-256` (App Secret).
- Receber texto, áudio, imagem, vídeo, documento e figurinha (mídia baixada e guardada no storage), nome do contato e origem de anúncio.
- Enviar texto pelo Inbox **dentro da janela de 24h** (fora dela o envio é bloqueado com aviso).
- Status de entrega na conversa: enviada ✓, entregue ✓✓, lida ✓✓ azul, falhou ⚠ (com o motivo).
- Tela Configurações > WhatsApp: checklist do servidor, URL do webhook e cadastro/validação de números.

## Próximas fases
1. Modelos (templates): criar, enviar para aprovação e acompanhar status.
2. Disparos em massa: campanhas, fila com limite por dia/tier, descadastro (opt-out), relatório de entrega.
3. Betina e cobrança automática (D+1/5/10) usando modelos aprovados; assistente respondendo no canal oficial.

## Passo a passo na Meta (uma vez)
1. **Meta Business Suite / Gerenciador de Negócios** da Colucci: confirmar a **verificação da empresa** (necessária para escalar).
2. **developers.facebook.com** > criar app tipo *Business* > adicionar o produto **WhatsApp**.
3. Criar/usar uma **conta WhatsApp Business (WABA)** e **adicionar um número** dedicado
   (não pode estar em uso no app WhatsApp comum/Business; o número da Evolution não serve para a API oficial sem migrar).
4. Em **Configurações do Negócio > Usuários do sistema**: criar um usuário do sistema, atribuir o app e a WABA e gerar um
   **token permanente** com `whatsapp_business_messaging` e `whatsapp_business_management`.
5. Copiar: **Phone Number ID**, **WABA ID**, **App Secret** (Configurações do app > Básico).
6. **Webhook** (WhatsApp > Configuração): colar a URL mostrada na tela do CRM e o token de verificação; assinar o campo **messages**.
7. Na Vercel (Production), cadastrar:
   - `WHATSAPP_CLOUD_TOKEN` (token permanente; marcar como sensível)
   - `META_APP_SECRET` (marcar como sensível)
   - `WHATSAPP_CLOUD_VERIFY_TOKEN` (palavra-chave que você escolhe)
   e fazer um novo deploy.
8. No CRM: Configurações > WhatsApp > API Oficial > cadastrar o **Phone Number ID** (o CRM valida o token na Meta).

## Regras que valem para volume
- Fora da janela de 24h só **modelos aprovados**; cada conversa iniciada pela empresa é cobrada por categoria (marketing, utilidade, autenticação, serviço).
- O limite diário começa baixo (ex.: 250 conversas iniciadas/24h) e sobe por **tier** conforme volume e **qualidade** (bloqueios/denúncias derrubam a nota).
- Só enviar para quem deu **consentimento (opt-in)** e respeitar **opt-out** — é o que protege o número de ser limitado.
