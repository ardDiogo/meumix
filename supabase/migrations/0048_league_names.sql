-- MeuMix — Ligas: nomes
-- Executar depois de 0047. Pode ser executado mais de uma vez.
-- Mix de segunda → "Mix da Lanterna"; mix de terça → "Mix do Jantinha".

update public.communities set name = 'Mix da Lanterna', description = 'Liga do mix de segunda'
where slug = 'principal';
update public.communities set name = 'Mix do Jantinha', description = 'Liga do mix de terça'
where slug = 'terca';
