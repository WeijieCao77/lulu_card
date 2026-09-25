/**
 * Test-only: every account these harnesses create counts as phone-verified.
 *
 * Under the formal policy the server refuses unverified accounts, and these
 * checks are about the market, swaps and account authority, not about the
 * door. The door itself is exercised by check_phone*, check_formal_phone_gate.
 */
export const AUTO_VERIFY = `
create or replace function test_auto_verify() returns trigger language plpgsql as $$
begin
  new.verified := coalesce(new.verified, now());
  new.verify_via := coalesce(new.verify_via, 'test');
  return new;
end $$;
drop trigger if exists test_auto_verify on card_accounts;
create trigger test_auto_verify before insert on card_accounts for each row execute function test_auto_verify();
`
