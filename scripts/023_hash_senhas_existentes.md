# Migração única: hash das senhas existentes

A tabela `usuarios` guardava a senha em texto puro na coluna `senha_hash` (nome
enganoso — nunca foi de fato um hash). Esta migração converte todos os valores
atuais para hash bcrypt, usando o mesmo algoritmo que o login/troca de senha
agora exigem (`app/api/auth/login`, `app/api/auth/change-password`).

## Pré-requisito

Variável de ambiente `SUPABASE_SECRET_KEY` configurada (chave secreta do
Supabase — Project Settings > API Keys — nunca a publishable/anon key).

## Como rodar

```bash
SUPABASE_SECRET_KEY=... node scripts/hash-user-passwords.mjs
```

Rode uma única vez. Script é idempotente: linhas cujo valor já é um hash
bcrypt (prefixo `$2`) são puladas automaticamente, então rodar de novo por
engano não quebra nada.
