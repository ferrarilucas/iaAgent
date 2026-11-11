# Bot de WhatsApp do Cipri

1. No repositório `coolkies-system`, aplique `patches/cipri-whatsapp.patch` com `git apply /caminho/para/cipri-whatsapp.patch` e publique o Cipri com a migration Prisma. Configure `CIPRI_BOT_SECRET` com um segredo aleatório de pelo menos 32 caracteres.
2. No serviço existente do iaAgent, configure `CIPRI_URL=https://cipri.com.br`, o mesmo `CIPRI_BOT_SECRET` e um `CIPRI_WEBHOOK_SECRET` aleatório de pelo menos 32 caracteres. O segredo do webhook deve usar apenas letras, números, hífen e sublinhado.
3. Configure `NINEROUTER_URL=https://9router.cipri.com.br/v1`, `NINEROUTER_MODEL=cipri` e `NINEROUTER_KEY` com a chave do 9Router. O bot usa a API HTTP do 9Router e o banco do Cipri via API interna.
4. Mantenha as variáveis `EVOLUTION_*` da instância do WhatsApp. Configure o evento `MESSAGES_UPSERT` para enviar o webhook via HTTPS em `/webhook/<CIPRI_WEBHOOK_SECRET>`, com a opção de sufixo por evento desativada.
5. Em uma conversa de teste, confirme que um número sem vínculo recebe um único aviso, abra o link e confirme o vínculo após entrar no Cipri. Em seguida, pergunte "Quanto a Jéssica me deve?" e "Quanto ainda tenho para receber este mês?".

O total mensal soma parcelas em aberto com vencimento no mês corrente em São Paulo, incluindo vencimentos anteriores dentro do próprio mês. Para contas com vários espaços, o bot informa que a consulta está disponível pelo app. O acesso usa as regras de assinatura do Cipri, incluindo períodos de teste válidos.

## Desenvolvimento

Use `pnpm install`, `pnpm test` e `pnpm typecheck`. Para rodar localmente, preencha `.env` a partir de `.env.example` e execute `docker compose up --build agent`. Com as variáveis já exportadas no shell, use `pnpm dev:agent`.
