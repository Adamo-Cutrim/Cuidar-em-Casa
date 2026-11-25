-- Ensaio local: dados FICTICIOS de dois usuarios, com o que costuma quebrar um backup (acentos, aspas, ; , quebra de linha, emoji, NULLs).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@ensaio.test', now(), '{"provider":"email"}', '{"nome":"Ana Enfermeira"}', '2026-11-01 10:00+00', now()),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bia@ensaio.test', now(), '{"provider":"email"}', '{"nome":"Bia \"Fisio\", d''Ávila; Júnior"}', '2026-11-02 11:30+00', now());

insert into public.profiles (user_id, nome, tel, profissao, registro, cidade) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Ana Enfermeira', '(11) 90000-0001', 'Enfermeira', 'COREN 000001', 'São Paulo'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'Bia Fisio', '', 'Fisioterapeuta', '', 'Belém');

insert into public.service_types (id, user_id, nome) values
  ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Curativo'),
  ('11111111-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Aplicação de medicação'),
  ('11111111-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Fisioterapia');

insert into public.companies (id, user_id, nome, tipo, contato, valor_padrao, pagamento, obs, cor) values
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Clínica "Aurora" & Filhos', 'Clínica', 'Dra. Paula; (00) 3000-0202', 150.00, 'Pagamento quinzenal', E'Enviar relatório\nno dia 5', 1),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Home Care Sul', 'Empresa de home care', '', null, '', '', 2);

insert into public.patients (id, user_id, company_id, nome, nasc, tel, resp_nome, resp_tel, endereco, bairro, ref, valor, condicoes, alergias, medicamentos, obs) values
  ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-000000000001', 'João d''Ávila da Conceição', '1944-03-12', '(11) 98888-0000', 'Maria (filha)', '(11) 97777-0000', 'Rua das Acácias, 128', 'Bela Vista', 'Portão azul; tocar 2x', 150.50, 'Hipertensão; diabetes', 'Dipirona, "látex"', 'Losartana 50mg', E'Linha 1\nLinha 2 com ; vírgula, aspas " e emoji 🙂'),
  ('dddddddd-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', null, 'Zeferina Çalves Ñandú', null, '', '', '', '', '', '', null, '', '', '', ''),
  ('dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b', 'cccccccc-0000-4000-8000-000000000002', 'Paciente da Bia', '1980-05-20', '', '', '', 'Av. Brasil, 10', 'Centro', '', 200.00, '', '', '', '');

-- 120 atendimentos do primeiro paciente: feitos (com valor guardado), agendados e cancelados; ligados e nao ligados ao tipo; com texto especial.
insert into public.visits (user_id, patient_id, data, hora, tipo, obs, status, serie_data, manual, valor_snapshot, service_type_id)
select 'aaaaaaaa-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-000000000001',
       date '2026-07-01' + g, time '08:00' + (g % 8) * interval '30 minutes',
       case when g % 3 = 0 then 'Curativo' when g % 3 = 1 then 'Aplicação de medicação' else '' end,
       case when g % 10 = 0 then E'Obs com "aspas", ; e\nquebra' else '' end,
       case when g % 5 = 0 then 'cancelado' when g % 2 = 0 then 'feito' else 'agendado' end,
       case when g % 7 = 0 then date '2026-07-01' + g else null end,
       g % 4 = 0,
       case when g % 5 <> 0 and g % 2 = 0 then (150.50 + (g % 3) * 10)::numeric(11,2) else null end,
       case when g % 3 = 0 then '11111111-0000-4000-8000-000000000001'::uuid when g % 3 = 1 then '11111111-0000-4000-8000-000000000002'::uuid else null end
  from generate_series(0, 119) g;
insert into public.visits (user_id, patient_id, data, hora, tipo, status, service_type_id) values
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'dddddddd-0000-4000-8000-000000000003', '2026-11-10', '14:00', 'Fisioterapia', 'agendado', '11111111-0000-4000-8000-000000000003');

insert into public.recurrences (patient_id, user_id, ativo, dias, hora, tipo, inicio, fim, service_type_id) values
  ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', true, '{1,3,5}', '08:30', 'Curativo', '2026-07-01', null, '11111111-0000-4000-8000-000000000001'),
  ('dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b', false, '{}', '09:00', '', '2026-01-01', '2026-12-31', null);
insert into public.recurrence_exceptions (patient_id, data, user_id) values
  ('dddddddd-0000-4000-8000-000000000001', '2026-11-11', 'aaaaaaaa-0000-4000-8000-00000000000a'),
  ('dddddddd-0000-4000-8000-000000000001', '2026-11-18', 'aaaaaaaa-0000-4000-8000-00000000000a');
