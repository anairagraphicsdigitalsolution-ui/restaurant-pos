-- Anaira branding cleanup.
-- Non-destructive: renames feature/provider labels only. No orders, customers,
-- payments, inventory or restaurant business rows are deleted.

update public.restaurant_integrations
set provider = 'payment-accounts',
    display_name = 'Payment Accounts',
    updated_at = now()
where lower(provider) = 'petpooja-pay'
   or lower(display_name) like '%petpooja%';

update public.restaurant_payment_accounts
set provider = 'payment-accounts',
    display_name = 'Payment Accounts',
    updated_at = now()
where lower(provider) = 'petpooja-pay'
   or lower(display_name) like '%petpooja%';

update public.restaurant_plugins
set plugin_code = 'payment-accounts'
where lower(plugin_code) = 'petpooja-pay';

-- Feature catalog rows, where this table exists, are normalized as well.
do $$
begin
  if to_regclass('public.feature_catalog') is not null then
    update public.feature_catalog
    set code = 'payment-accounts',
        name = 'Payment Accounts'
    where lower(code) = 'petpooja-pay'
       or lower(name) like '%petpooja%';
  end if;
end $$;
