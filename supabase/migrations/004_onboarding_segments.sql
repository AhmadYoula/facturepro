-- Segment-aware onboarding for FacturePro.

alter table public.organizations add column if not exists target_segment text not null default 'business'
  check (target_segment in ('freelancer', 'business', 'nonprofit', 'accounting_firm'));

create or replace function public.create_organization_with_owner_v2(organization_name text, segment text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organization_id uuid;
  safe_segment text := coalesce(nullif(segment, ''), 'business');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if safe_segment not in ('freelancer', 'business', 'nonprofit', 'accounting_firm') then raise exception 'Unsupported organization segment'; end if;
  insert into public.organizations(name, target_segment) values (organization_name, safe_segment) returning id into new_organization_id;
  insert into public.organization_members(organization_id, user_id, role) values (new_organization_id, auth.uid(), 'owner');
  insert into public.companies(organization_id, name, legal_name) values (new_organization_id, organization_name, organization_name);
  insert into public.profiles(user_id, display_name, email) values (auth.uid(), coalesce(auth.jwt()->'user_metadata'->>'display_name', ''), coalesce(auth.jwt()->>'email', '')) on conflict (user_id) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();
  return new_organization_id;
end;
$$;

grant execute on function public.create_organization_with_owner_v2(text, text) to authenticated;
