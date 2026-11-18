# Auditoria de segurança e estrutura: Cuidar em Casa

Data: 16/11/2026, 22:59 (horário de Brasília). Versão auditada e corrigida: 14.

## Como foi feito (e o que não foi)

Não existe skill de segurança disponível na conta nem para adicionar, então a auditoria foi feita diretamente no código, com buscas por padrões perigosos e testes automatizados em navegador (Chrome sem interface).

Verificado:
- Busca por padrões perigosos: eval, Function, document.write, handlers inline (onclick etc.), requisições de rede (fetch, XHR, WebSocket), postMessage, cookies, console. Resultado: nenhum.
- Todos os pontos que montam HTML: nenhum campo de texto digitado entra na página sem escape.
- Teste com dados hostis (ids com aspas e atributos de evento, nomes com tags HTML e script, id "__proto__", textos de 9000 caracteres, datas e horas inválidas, status inventado): nada executou, o protótipo de objetos não foi poluído, a página continuou funcionando.
- Planilha CSV: nomes que começam com =, +, - ou @ são neutralizados (evita injeção de fórmula no Excel).
- Execução do app sob uma política de segurança de conteúdo (CSP) estrita, sem requisições externas: sem violações.
- Login: criação, entrada, troca de senha, redefinição, bloqueio por tentativas (inclusive após recarregar a página), manter conectado, sair (a tela é esvaziada).
- Relatório de faturamento: totais conferidos contra cálculo manual.
- Zero bibliotecas JavaScript de terceiros. A única dependência externa é o CSS das fontes do Google Fonts.

NÃO verificado (não é possível neste ambiente):
- Gravação e leitura reais no banco da conta Claude (usei um banco simulado). Inclui comportamento com dois aparelhos ao mesmo tempo.
- Toque e rolagem em celular real.
- Qualquer ambiente de produção fora do Claude (o app ainda não foi implantado lá).
- Não sou advogado. A parte de LGPD abaixo é um alerta, não parecer jurídico.

## Corrigido na versão 14

1. Dados de fora (armazenamento do aparelho e da conta) agora passam por validação rígida antes de usar: ids só com letras, números, _ e - (eles entram em atributos HTML); textos com tamanho máximo; datas, horas, status e números validados; registros inválidos são descartados ou reparados.
2. Relatório de faturamento usa mapas sem protótipo (evita poluição de protótipo se um id for "__proto__").
3. Senha: PBKDF2 com 600 mil iterações (antes 150 mil, abaixo da recomendação atual). Contas antigas são atualizadas automaticamente no próximo login.
4. Bloqueio por tentativas de senha agora sobrevive a recarregar a página e aumenta a cada rodada (30 s, 1 min, 2 min... até 15 min). Vale também para trocar a senha.
5. Ids novos usam gerador aleatório do navegador (crypto) em vez de Math.random.
6. Campos de formulário sem limite agora têm tamanho máximo.
7. Relatório: período personalizado limitado a 2 anos (evita travar o app com intervalos absurdos).
8. Aviso de armazenamento: o rodapé e um aviso na tela informam quando os dados chegam perto do limite da conta e quando o limite é ultrapassado (antes a falha era silenciosa).

## NÃO corrigido: decisões e riscos para o deploy

### Bloqueadores (se o app for implantado fora do Claude)

A. Login só no navegador. A tela de login é uma trava de conveniência. Quem abre as ferramentas do navegador consegue pular a tela (marcadores de sessão no armazenamento do navegador) ou ler os dados direto. Segurança real exige servidor: contas, sessão e dados protegidos no servidor.

B. Dados em texto puro no aparelho. Uma cópia de todos os dados dos pacientes fica no armazenamento local do navegador, sem criptografia, e permanece lá mesmo depois de "Sair". Em aparelho compartilhado, ou com qualquer falha de XSS futura, isso expõe tudo. No deploy real, os dados devem ficar no servidor, com no máximo um cache mínimo.

C. Sem política de segurança de conteúdo (CSP) própria e sem cabeçalhos de segurança. Na hospedagem própria é preciso configurar: Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, frame-ancestors, HTTPS obrigatório (HSTS). Hoje o app depende de scripts e estilos inline, o que obriga a CSP a permitir 'unsafe-inline'. Para uma CSP estrita, separar o JavaScript e o CSS em arquivos (com hash ou nonce).

D. Fontes do Google. Carregar as fontes de fonts.googleapis.com envia o IP do usuário ao Google a cada acesso. Para o deploy, hospedar as fontes junto do app.

### Risco estrutural (afeta o app atual dentro do Claude)

E. Limite de 256 KiB por documento. O app guarda tudo em um único documento. Medi cerca de 565 bytes por paciente e 161 por atendimento. Um profissional com uns 25 atendimentos por semana gera cerca de 200 KiB por ano só de atendimentos: o limite seria atingido em pouco mais de um ano. Hoje o app avisa e mantém os dados só no aparelho, mas deixa de sincronizar. Solução: dividir os atendimentos por mês em documentos separados (ou, no deploy próprio, usar um banco de dados de verdade).

F. Conflito entre aparelhos. Vale a "última gravação" (contador de revisão). Dois aparelhos editando ao mesmo tempo, ou um offline, podem sobrescrever alterações um do outro. Não foi testado com o banco real.

### Decisões de produto e privacidade

G. Redefinir a senha só exige digitar o e-mail da conta, sem verificação. É inevitável sem servidor de e-mail.

H. O arquivo CSV e o resumo copiado trazem os valores reais mesmo com os valores ocultos na tela (decisão deliberada, avisada na tela).

I. Faltam recursos que se espera de um sistema com dados de saúde: bloqueio por inatividade, backup e importação, "apagar todos os meus dados", registro de acessos, termo de consentimento e política de privacidade.

J. LGPD. Dados de saúde são dados pessoais sensíveis. Em produção é necessário base legal (ex.: consentimento ou tutela da saúde), minimização de dados, contrato com o provedor de hospedagem, criptografia em trânsito e em repouso, backup e plano para vazamento. Consulte um profissional de proteção de dados antes de publicar para terceiros.

### Qualidade do código

K. Arquivo único de cerca de 1900 linhas, sem testes automatizados no repositório (os testes desta auditoria ficaram fora do projeto). Para manter com segurança: separar em módulos (dados, tela, relatório, conta), guardar os testes junto do código e rodar um linter e um verificador de dependências na publicação.
