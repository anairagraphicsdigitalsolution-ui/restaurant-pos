insert into storage.buckets (id,name,public)
values ('platform-marketing-media','platform-marketing-media',false)
on conflict (id) do update set public=false;
