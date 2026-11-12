-- A execução de DCA acompanha o lançamento ligado a ela, direto no banco:
-- lançamento criado -> execução feita; lançamento excluído -> execução volta a pendente.
-- Assim o estado fica certo mesmo quando o lançamento é mexido fora do app.

create function public.sync_dca_execution()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.dca_execution_id is not null then
    update public.dca_executions set status = 'done', transaction_id = new.id where id = new.dca_execution_id;
  elsif tg_op = 'DELETE' and old.dca_execution_id is not null then
    update public.dca_executions set status = 'pending', transaction_id = null where id = old.dca_execution_id;
  end if;
  return null;
end $$;

create trigger transactions_sync_dca_execution
  after insert or delete on public.transactions
  for each row execute function public.sync_dca_execution();
