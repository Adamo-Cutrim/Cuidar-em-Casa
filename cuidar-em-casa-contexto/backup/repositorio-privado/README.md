# Backups do Cuidar em Casa (repositório PRIVADO)

Este repositório guarda **somente** o agendador do backup e os scripts. Os backups em si são **artefatos cifrados** do GitHub Actions
(aba **Actions** → execução → **Artifacts**), nunca arquivos no repositório.

- **Quando roda:** todo dia às 02:30 (Brasília), ou manualmente em Actions → *Backup do banco* → *Run workflow*.
- **Quanto guarda:** 30 dias (variável `BACKUP_RETENCAO_DIAS`).
- **Cifrado com:** a chave PÚBLICA `BACKUP_AGE_PUBLIC_KEY`. **Só a chave privada** (que ficou com você) abre os arquivos. **Se ela se perder, os backups ficam inúteis.**
- **Segredos do repositório:** `BACKUP_DB_URL` (banco, com a role somente-leitura `backup_ro`) e `BACKUP_AGE_PUBLIC_KEY`.
- **Restaurar:** `scripts/restaurar.sh ARQUIVO.tar.gz.age CHAVE_PRIVADA.txt URL_DO_PROJETO_NOVO`. Teste num projeto descartável a cada 3 meses.
- `ultimo-backup.txt` é o batimento: só datas, tamanhos e contagens de linhas (nenhum dado de paciente).

**Este repositório precisa ser PRIVADO.** Se algum dia ele for tornado público, os artefatos e os registros ficam acessíveis a qualquer pessoa.
Guia completo: `backup/README.md` no repositório do projeto.
