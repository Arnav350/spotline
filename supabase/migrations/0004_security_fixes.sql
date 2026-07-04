-- Clean up pre-fill trigger removed from 0003 (safe no-op if never applied)
drop trigger if exists on_auth_user_created_ai_limit on auth.users;
drop function if exists handle_new_user_ai_limit();

-- 1. Fix shows INSERT policy: enforce owner_id = auth.uid()
drop policy if exists "Authenticated users can create shows" on shows;
create policy "Authenticated users can create shows"
  on shows for insert with check (owner_id = auth.uid());

-- 2. Expired invitation cleanup (called from accept RPCs; also safe to run on demand)
create or replace function cleanup_expired_invitations()
returns void language plpgsql security definer as $$
begin
  delete from invitations where expires_at < now() - interval '7 days';
end;
$$;

-- Update accept_invite to run cleanup first
create or replace function accept_invite(invite_token uuid)
returns json language plpgsql security definer as $$
declare
  inv record;
begin
  perform cleanup_expired_invitations();
  select * into inv from invitations
  where token = invite_token
    and status = 'pending'
    and expires_at > now()
    and show_id is not null;
  if not found then
    return json_build_object('error', 'Invalid or expired invitation');
  end if;
  insert into show_members (show_id, user_id, role)
    values (inv.show_id, auth.uid(), inv.role)
    on conflict (show_id, user_id) do update set role = excluded.role;
  update invitations set status = 'accepted' where id = inv.id;
  return json_build_object('show_id', inv.show_id);
end;
$$;

-- Update accept_folder_invite to run cleanup first
create or replace function accept_folder_invite(invite_token uuid)
returns json language plpgsql security definer as $$
declare
  inv  record;
  s    record;
begin
  perform cleanup_expired_invitations();
  select * into inv from invitations
  where token = invite_token
    and status = 'pending'
    and expires_at > now()
    and folder_id is not null;
  if not found then
    return json_build_object('error', 'Invalid or expired folder invitation');
  end if;
  insert into folder_members (folder_id, user_id, role)
    values (inv.folder_id, auth.uid(), inv.role)
    on conflict (folder_id, user_id) do update set role = excluded.role;
  for s in select id from shows where folder_id = inv.folder_id loop
    insert into show_members (show_id, user_id, role)
      values (s.id, auth.uid(), inv.role)
      on conflict (show_id, user_id) do update set role = excluded.role;
  end loop;
  update invitations set status = 'accepted' where id = inv.id;
  return json_build_object('folder_id', inv.folder_id);
end;
$$;

-- 3. Invite limit: max 20 pending invites per show/folder
create or replace function check_invite_rate_limit()
returns trigger language plpgsql as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from invitations
  where status = 'pending'
    and (
      (new.show_id is not null and show_id = new.show_id)
      or (new.folder_id is not null and folder_id = new.folder_id)
    );
  if v_count >= 20 then
    raise exception 'Maximum of 20 pending invitations allowed per show or folder.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_invitation_rate_limit on invitations;
create trigger on_invitation_rate_limit
  before insert on invitations
  for each row execute function check_invite_rate_limit();

-- 4. Auto-grant folder members when a show is moved into a folder
create or replace function auto_grant_folder_members()
returns trigger language plpgsql security definer as $$
begin
  if new.folder_id is null then return new; end if;
  if old.folder_id is not distinct from new.folder_id then return new; end if;

  insert into show_members (show_id, user_id, role)
  select new.id, fm.user_id, fm.role
  from folder_members fm
  where fm.folder_id = new.folder_id
    and fm.user_id != new.owner_id
  on conflict (show_id, user_id) do update set role = excluded.role;

  return new;
end;
$$;

drop trigger if exists on_show_folder_change on shows;
create trigger on_show_folder_change
  after update of folder_id on shows
  for each row execute function auto_grant_folder_members();

-- 5. Tighten show_public_links SELECT policy
-- "Anyone can read public links" lets any authenticated user enumerate all tokens.
-- Drop it — owners are already covered by "Owners can manage public links" (for all),
-- and the security-definer RPCs (get_show_from_public_token, is_public_show) bypass RLS.
drop policy if exists "Anyone can read public links" on show_public_links;

-- 6. Block disposable/throwaway email domains on signup
create or replace function block_disposable_email()
returns trigger
language plpgsql
security definer
as $$
declare
  v_domain text;
  disposable_domains text[] := array[
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
    'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.info', 'grr.la',
    'sharklasers.com', 'guerrillamailblock.com', 'spam4.me', 'yopmail.com',
    'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx',
    'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf',
    'monemail.fr.nf', 'monmail.fr.nf', 'tempmail.com', 'temp-mail.org',
    'throwam.com', 'throwam.net', 'dispostable.com', 'mailnull.com',
    'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org', 'trashmail.at',
    'trashmail.com', 'trashmail.io', 'trashmail.me', 'trashmail.net',
    'trashmail.org', 'trashmail.xyz', 'wegwerfmail.de', 'wegwerfmail.net',
    'wegwerfmail.org', 'maildrop.cc', 'mailnesia.com', 'mailnull.com',
    'spamspot.com', 'spamthis.co.uk', 'spamtroll.net', 'temporaryemail.net',
    'temporaryinbox.com', 'throwaway.email', 'filzmail.com', 'getnada.com',
    'mohmal.com', 'spamfree24.org', 'tempinbox.com', 'tempinbox.co.uk',
    'tempomail.fr', 'thanksnospam.info', 'trbvm.com', 'mailexpire.com',
    'fakeinbox.com', 'antichef.com', 'antichef.net', 'antispam24.de',
    'chacuo.net', 'deadaddress.com', 'discardmail.com', 'discardmail.de',
    'discard.email', 'e4ward.com', 'emaildienst.de', 'emailias.com',
    'emailinfive.com', 'emailtemporanea.com', 'emailtemporanea.net',
    'emailtemporanea.org', 'fakeemailgenerator.com', 'filzmail.com',
    'fizmail.com', 'kurzepost.de', 'letthemeatspam.com', 'lortemail.dk',
    'mt2009.com', 'mt2014.com', 'mytrashmail.com', 'netmails.com',
    'nobulk.com', 'noclickemail.com', 'nogmailspam.info', 'nospamfor.us',
    'nowmymail.com', 'objectmail.com', 'obobbo.com', 'oneoffemail.com',
    'onewaymail.com', 'pookmail.com', 'putthisinyourspamdatabase.com',
    'rcpt.at', 'recode.me', 'regbypass.com', 'rklips.com',
    'safe-mail.net', 'safetypost.de', 'sandelf.de', 'schafmail.de',
    'schrott-email.de', 'secretemail.de', 'secure-mail.biz',
    'selfdestructingmail.com', 'sendspamhere.com', 'shiftmail.com',
    'skeefmail.com', 'slopsbox.com', 'snakemail.com', 'sneakemail.com',
    'snkmail.com', 'sofimail.com', 'sofort-mail.de', 'sogetthis.com',
    'spam.la', 'spam.su', 'spamavert.com', 'spambob.com', 'spambob.net',
    'spambob.org', 'spambog.com', 'spambog.de', 'spambog.ru',
    'spambox.info', 'spambox.us', 'spamcannon.com', 'spamcannon.net',
    'spamcon.org', 'spamcorpse.com', 'spamevader.com', 'spamfree.eu',
    'spamfree24.de', 'spamfree24.eu', 'spamfree24.info', 'spamfree24.net',
    'spamgoes.in', 'spamhole.com', 'spamify.com', 'spaminator.de',
    'spamkill.info', 'spaml.com', 'spaml.de', 'spammotel.com',
    'spammy.host', 'spamoff.de', 'spamsalad.in', 'spamsphere.com',
    'spamstack.net', 'spamthisplease.com', 'spamwc.de', 'spamwc.net',
    'spamwc.org', 'spikio.com', 'suremail.info', 'sweetxxx.de',
    'techemail.com', 'techgroup.me', 'teleworm.com', 'teleworm.us',
    'temp-mail.ru', 'tempail.com', 'tempalias.com', 'tempe-mail.com',
    'tempemail.co.za', 'tempemail.com', 'tempemail.net', 'tempmail.de',
    'tempmail.eu', 'tempmail.it', 'tempmaildemo.com', 'tempmailer.com',
    'tempmailer.de', 'temporaryemail.net', 'temporaryforwarding.com',
    'temporarymailaddress.com', 'tempthe.net', 'thisisnotmyrealemail.com',
    'throam.com', 'throwam.com', 'tilien.com', 'tmailinator.com',
    'tradermail.info', 'trash-amil.com', 'trash-mail.at', 'trash-mail.com',
    'trash-mail.de', 'trash-mail.ga', 'trash-mail.io', 'trash-mail.net',
    'trash2009.com', 'trash2010.com', 'trash2011.com', 'trashdevil.com',
    'trashdevil.de', 'trashemail.de', 'trashimail.de', 'trashmail.app',
    'trashmail.at', 'trashmail.com', 'trashmail.de', 'trashmail.io',
    'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashmail.se',
    'trashmail.xyz', 'trashmailer.com', 'turual.com', 'twinmail.de',
    'tyldd.com', 'venompen.com', 'veryrealemail.com', 'webm4il.info',
    'wegwerfadresse.de', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
    'wuzupmail.net', 'xagloo.com', 'xemaps.com', 'xents.com',
    'xmaily.com', 'xoxy.net', 'yepmail.net', 'yogamaven.com',
    'yopmail.com', 'yopmail.fr', 'yuurok.com', 'z1p.biz',
    'zehnminuten.de', 'zehnminutenmail.de', 'zippymail.info',
    'zoemail.net', 'zoemail.org', 'zomg.info'
  ];
begin
  v_domain := lower(split_part(new.email, '@', 2));
  if v_domain = any(disposable_domains) then
    raise exception 'Disposable email addresses are not allowed.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_block_disposable on auth.users;
create trigger on_auth_user_created_block_disposable
  before insert on auth.users
  for each row execute function block_disposable_email();
