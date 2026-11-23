# Versões do app Cuidar em Casa

Cada linha é uma cópia completa do app (arquivo .html) salva neste projeto, com o número da versão publicada e a data e hora (horário de Brasília) em que foi salva.

| Versão | Data e hora | Arquivo | O que tem |
|---|---|---|---|
| 16 | 23/11/2026 17:54 | versoes/v16_2026-11-23_1754_site/ (pasta, inclui `fonts/`) | Correções E1 a E5 (agenda sem o quadro verde do login; limites de campo iguais aos do banco; sem estilos inline), **fontes hospedadas junto com o site** (sem Google Fonts; auditoria D) e **restaurar backup (JSON)** no Perfil: só acrescenta, nunca apaga nem sobrescreve; ids próprios da conta; reimportar não duplica; backup de outra conta funciona. Baixar backup agora ignora os dados de exemplo. 57 verificações antigas + 44 do backup (`t3.py`), 0 falhas. |
| 15 | 18/11/2026 16:13 | versoes/v15_2026-11-18_1613_site/ (pasta: index.html, app.js, styles.css, manifest, ícone, vercel.json) | Primeira versão independente (fora do Claude), gerada por `fonte-e-ferramentas/build_site.py` a partir da v14. Login real pelo Supabase Auth e dados no **esquema normalizado**: cada entidade na sua tabela, ids uuid, recorrências e exceções em tabelas próprias, tipos de atendimento em `service_types`. Dados de exemplo não vão para o banco. 57 verificações de navegador contra o Supabase simulado. |
| 14 | 16/11/2026 22:59 | versoes/v14_2026-11-16_2259.html | Endurecimento de segurança: validação rígida dos dados, senha com 600 mil iterações, bloqueio de tentativas que persiste, aviso de limite de armazenamento, ids aleatórios seguros, limites de tamanho nos campos. Detalhes em seguranca/AUDITORIA_2026-11-16.md. |
| 13 | 16/11/2026 18:03 | versoes/v13_2026-11-16_1803.html | Relatório de faturamento nas abas Pacientes e Empresas e nas fichas: por mês ou outro período, por paciente ou por empresa, com filtros. Exporta planilha CSV e copia o resumo. |
| 12 | 16/11/2026 17:55 | versoes/v12_2026-11-16_1755.html | Botão Menu na barra (Perfil, Configurações, Notificações, Atendimentos). Tela de login e cadastro com senha. Aviso ao desvincular paciente de empresa. Vincular paciente já cadastrado a uma empresa. Tipos de atendimento editáveis, agora chamados Atendimentos. |

Observações:
- A partir da v15 a cópia é uma **pasta** (o site é publicado em arquivos separados). As anteriores são um .html único que roda dentro do Claude.
- As versões 1 a 11 foram publicadas antes de existir este registro e não têm cópia aqui.
- Para abrir uma cópia, baixe o arquivo .html e abra no navegador. Os dados dos pacientes não vão junto: ficam na conta e no aparelho de quem usa.
