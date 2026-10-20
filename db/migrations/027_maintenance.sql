-- Site-wide switches admins flip from the admin panel: one row. Maintenance blocks the site
-- except the maintenance page, sign-in and the admin panel's off switch.
create table site_settings (
  id boolean primary key default true check (id),
  maintenance boolean not null default false
);
insert into site_settings default values;
