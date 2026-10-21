# 🥖 Escala do Pão

Rodízio de quem traz o pão, com lembrete pelo WhatsApp. Site estático (GitHub Pages) com dados no Firebase (Auth + Firestore).

## Regras
- Só dias úteis (seg–sex), fora dos feriados nacionais (calculados automaticamente) e dos dias extras cadastrados.
- Traz o pão quem estiver disponível com mais folgas; quem traz zera, os outros somam 1.
- Afastado (férias, folga, missão…) não é escalado e fica com a folga congelada.
- "Não trouxe" mantém a folga: ele é escalado de novo no dia seguinte.
- Troca com permuta: quem sai assume o próximo dia de quem entra.

As regras ficam em `js/regras.js` e são testadas com `npm test` (Node 18+).

## Configuração do Firebase (uma vez)
1. **Authentication → Método de login →** ativar *E-mail/senha*.
2. **Authentication → Usuários → Adicionar usuário** para cada pessoa que vai usar.
3. **Authentication → Configurações → Domínios autorizados →** adicionar `SEU-USUARIO.github.io`.
4. **Firestore Database → Criar banco** (modo produção, região `southamerica-east1`).
5. **Firestore → Regras →** colar o conteúdo de `firestore.rules` com os e-mails autorizados e publicar.
6. Colar a configuração do app Web em `js/firebase-config.js`.

## Testar sem Firebase
Abra `testes/demo.html` por um servidor local (ex.: `http://localhost/escala_pao_web/testes/demo.html`). Senha da demonstração: `demo`.
