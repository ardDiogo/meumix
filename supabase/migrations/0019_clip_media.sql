-- MeuMix — mídia dos clipes importados do Allstar (miniatura e vídeo direto)
-- Executar depois de 0018. Pode ser executado mais de uma vez.

alter table public.clips add column if not exists thumbnail_url text;
alter table public.clips add column if not exists video_url text;
