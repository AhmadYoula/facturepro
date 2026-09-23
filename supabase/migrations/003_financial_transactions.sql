-- Atomic financial operations and activity audit for FacturePro.

create or replace function public.record_invoice_payment(
  target_invoice_id uuid,
  payment_id uuid,
  payment_amount bigint,
  payment_method public.payment_method,
  payment_date date default current_date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invoice public.invoices%rowtype;
  remaining bigint;
  payment_inserted boolean;
begin
  select * into current_invoice from public.invoices where id = target_invoice_id for update;
  if not found or not public.is_organization_editor(current_invoice.organization_id) then raise exception 'Invoice not found or access denied'; end if;
  remaining := current_invoice.total_ttc_minor - current_invoice.amount_paid_minor - current_invoice.amount_credited_minor;
  if payment_amount <= 0 or payment_amount > remaining then raise exception 'Payment must be positive and cannot exceed balance'; end if;
  insert into public.payments(id, invoice_id, organization_id, amount_minor, method, paid_on)
  values (payment_id, target_invoice_id, current_invoice.organization_id, payment_amount, payment_method, payment_date)
  on conflict (id) do nothing
  returning true into payment_inserted;
  if coalesce(payment_inserted, false) then
    update public.invoices set amount_paid_minor = amount_paid_minor + payment_amount where id = target_invoice_id;
  end if;
  insert into public.activity_logs(organization_id, user_id, action, entity_type, entity_id, metadata)
  values (current_invoice.organization_id, auth.uid(), 'payment_recorded', 'invoice', target_invoice_id, jsonb_build_object('amount_minor', payment_amount, 'payment_id', payment_id));
  insert into public.notifications(organization_id, kind, title, detail)
  values (current_invoice.organization_id, 'payment', 'Paiement enregistré', current_invoice.number || ' a reçu un paiement.');
end;
$$;

create or replace function public.create_invoice_credit_note(target_invoice_id uuid, credit_amount bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invoice public.invoices%rowtype;
  remaining bigint;
begin
  select * into current_invoice from public.invoices where id = target_invoice_id for update;
  if not found or not public.is_organization_editor(current_invoice.organization_id) then raise exception 'Invoice not found or access denied'; end if;
  remaining := current_invoice.total_ttc_minor - current_invoice.amount_paid_minor - current_invoice.amount_credited_minor;
  if credit_amount <= 0 or credit_amount > remaining then raise exception 'Credit note must be positive and cannot exceed balance'; end if;
  insert into public.credit_notes(invoice_id, organization_id, amount_minor) values (target_invoice_id, current_invoice.organization_id, credit_amount);
  update public.invoices set amount_credited_minor = amount_credited_minor + credit_amount where id = target_invoice_id;
  insert into public.activity_logs(organization_id, user_id, action, entity_type, entity_id, metadata)
  values (current_invoice.organization_id, auth.uid(), 'credit_note_created', 'invoice', target_invoice_id, jsonb_build_object('amount_minor', credit_amount));
end;
$$;

create or replace function public.update_invoice_workflow(target_invoice_id uuid, next_status public.invoice_workflow_status, next_due_date date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invoice public.invoices%rowtype;
begin
  select * into current_invoice from public.invoices where id = target_invoice_id for update;
  if not found or not public.is_organization_editor(current_invoice.organization_id) then raise exception 'Invoice not found or access denied'; end if;
  if next_status = 'draft' and (current_invoice.amount_paid_minor > 0 or current_invoice.amount_credited_minor > 0) then raise exception 'A paid or credited invoice cannot return to draft'; end if;
  update public.invoices set workflow_status = next_status, sent_at = case when next_status = 'sent' then coalesce(sent_at, now()) else sent_at end, due_date = coalesce(next_due_date, due_date) where id = target_invoice_id;
  insert into public.activity_logs(organization_id, user_id, action, entity_type, entity_id, metadata)
  values (current_invoice.organization_id, auth.uid(), 'invoice_workflow_updated', 'invoice', target_invoice_id, jsonb_build_object('status', next_status));
end;
$$;

grant execute on function public.record_invoice_payment(uuid, uuid, bigint, public.payment_method, date) to authenticated;
grant execute on function public.create_invoice_credit_note(uuid, bigint) to authenticated;
grant execute on function public.update_invoice_workflow(uuid, public.invoice_workflow_status, date) to authenticated;
