-- Adds order_index to performers, props, and performer_groups so they can be
-- manually reordered, matching the existing pattern used by formations and
-- audio_segments. Backfills existing rows using their created_at ordering
-- (performer_groups has no created_at, so id ordering is used instead).

alter table performers       add column if not exists order_index integer;
alter table props            add column if not exists order_index integer;
alter table performer_groups add column if not exists order_index integer;

with ranked as (
  select id, row_number() over (partition by show_id order by created_at, id) - 1 as rn
  from performers
)
update performers set order_index = ranked.rn
from ranked
where performers.id = ranked.id and performers.order_index is null;

with ranked as (
  select id, row_number() over (partition by show_id order by created_at, id) - 1 as rn
  from props
)
update props set order_index = ranked.rn
from ranked
where props.id = ranked.id and props.order_index is null;

with ranked as (
  select id, row_number() over (partition by show_id order by id) - 1 as rn
  from performer_groups
)
update performer_groups set order_index = ranked.rn
from ranked
where performer_groups.id = ranked.id and performer_groups.order_index is null;

alter table performers       alter column order_index set not null;
alter table performers       alter column order_index set default 0;
alter table props            alter column order_index set not null;
alter table props            alter column order_index set default 0;
alter table performer_groups alter column order_index set not null;
alter table performer_groups alter column order_index set default 0;
