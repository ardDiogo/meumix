-- MeuMix — exclusão de conta com anonimização (P-05) e retenção do log (P-02)
-- Executar depois de 0023. Pode ser executado mais de uma vez.
--
-- Chamada pelo servidor ANTES de apagar o usuário no Auth. O resto sai em
-- cascata ao apagar o perfil (inscrições, votos, clipes, insígnias, penalidades,
-- link pessoal, análises, histórico de ELO). O que fica, anonimizado:
--   * placares (player_match_records): o nick vira "Jogador removido" e o
--     vínculo com a conta é removido (on delete set null) — os resultados dos
--     outros jogadores continuam corretos;
--   * log de auditoria: sem IP, navegador, e-mail, nick ou contas externas.

create or replace function public.anonymize_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_records int;
  v_logs int;
  v_id text := p_user::text;
begin
  update public.player_match_records
     set player_name = 'Jogador removido'
   where user_id = p_user;
  get diagnostics v_records = row_count;

  update public.audit_log
     set detail = (coalesce(detail, '{}'::jsonb) - array['ip', 'user_agent', 'email', 'nick', 'steamId', 'twitch', 'name'])
                  || jsonb_build_object('titular_excluido', true)
   where actor_id = p_user
      or detail ->> 'userId' = v_id
      or detail ->> 'user_id' = v_id;
  get diagnostics v_logs = row_count;

  return jsonb_build_object('placares', v_records, 'logs', v_logs);
end;
$$;

revoke all on function public.anonymize_account(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;

-- Retenção do log (P-02): IP e navegador somem após 6 meses; eventos com mais
-- de 24 meses são apagados. Chamada diariamente pelo cron da Vercel
-- (/api/cron/retencao) com a chave secreta.
create or replace function public.purge_audit_log()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scrubbed int;
  v_deleted int;
begin
  update public.audit_log
     set detail = detail - array['ip', 'user_agent']
   where created_at < now() - interval '6 months'
     and (detail ? 'ip' or detail ? 'user_agent');
  get diagnostics v_scrubbed = row_count;

  delete from public.audit_log where created_at < now() - interval '24 months';
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ip_removidos', v_scrubbed, 'eventos_apagados', v_deleted);
end;
$$;

revoke all on function public.purge_audit_log() from public, anon, authenticated;
grant execute on function public.purge_audit_log() to service_role;
