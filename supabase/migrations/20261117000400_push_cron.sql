-- Lembrete diário: a função "push" roda a cada hora e avisa quem escolheu aquela hora (Brasília).
select cron.schedule('send-reminders', '0 * * * *', $$select public.call_edge_function('push')$$);
