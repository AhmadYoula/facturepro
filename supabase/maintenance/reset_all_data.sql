-- DESTRUCTIVE: deletes every FacturePro organization, business record and Supabase Auth user.
-- Keeps schema, RLS policies and functions intact.

begin;

delete from public.organizations;
delete from public.profiles;
delete from auth.users;

commit;
