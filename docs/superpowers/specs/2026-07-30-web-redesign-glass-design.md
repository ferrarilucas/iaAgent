# Redesign do portal web — glass premium, dark/light, nav flutuante

Data: 2026-07-30

## Objetivo

Redesenhar o portal web (`apps/web`) com visual moderno "premium fintech" (glassmorphism),
mantendo a identidade da pilinha (navy + dourado). Suporte a tema claro e escuro (dark-first),
navegação flutuante e abordagem mobile-first. Sem features novas: apenas login, dashboard,
transações e espaços.

## Decisões

- **Estética**: glass premium fintech, dark-first.
- **Navegação**: tab bar flutuante + FAB no mobile; dock vertical flutuante no desktop.
- **Escopo**: telas atuais + tema + navegação. Limites e perfil ficam fora.

## Design tokens & tema

- Tokens semânticos via CSS variables em `globals.css`: `--bg`, `--surface`, `--surface-2`,
  `--border`, `--text`, `--muted`, `--soft`, `--accent` (dourado), `--accent-contrast`,
  `--success`, `--danger`, além de sombras/blur de vidro.
- Definidos em `:root` (light) e sobrescritos em `[data-theme="dark"]` (dark).
- `tailwind.config`: `darkMode: ["selector", '[data-theme="dark"]']`; cores da paleta apontam
  para as CSS vars (ex.: `surface: "var(--surface)"`), então os componentes não precisam de
  `dark:` espalhado.
- Dark-first: no 1º acesso segue `prefers-color-scheme`; a escolha do usuário persiste em
  `localStorage` (`pilinha-theme`). Script inline no `<head>` aplica `data-theme` antes da
  hidratação para evitar flash.

## Glass

- Superfícies translúcidas com `backdrop-blur`, borda fininha (`--border`), sombra suave,
  cantos `2xl/3xl`. Brilho radial dourado sutil no fundo. Números tabulares no dinheiro.

## Navegação flutuante

- Componente `FloatingNav` (client, `usePathname`):
  - Mobile (`< md`): barra flutuante fixa embaixo (glass pill) — Início, Transações, Espaços —
    com FAB dourado central que abre um bottom sheet "Lançar pela pilinha" (deep-link WhatsApp
    via env público opcional `NEXT_PUBLIC_PILINHA_WHATSAPP` + dica). Item ativo destacado.
  - Desktop (`>= md`): dock vertical flutuante à esquerda (logo no topo; ícones com label;
    embaixo toggle de tema + sair). Conteúdo com deslocamento à esquerda.
- `ThemeToggle` (client): alterna claro/escuro, persiste, atualiza `data-theme`.

## Telas

Mesmo conteúdo/dados de hoje, revestidos com os tokens de vidro e responsivos mobile-first:
login, dashboard (KPIs do mês, gastos por categoria, últimos lançamentos), transações
(filtros + lista + rodapé de saldo), espaços (membros + convite + convites recebidos).

## Verificação

- `tsc --noEmit` e `next build` sem erros.
- Screenshots reais de login e dashboard em mobile e desktop, nos dois temas, via sessão
  semeada no Postgres local.

## Fora de escopo

Limites/orçamentos, tela de perfil/config, qualquer mudança de dados ou de backend.
