-- =============================================================================
-- MIGRATION 0015: Barry Itabuna real data (extintores 192-276)
--
-- Sets the known tipo_carga + setor for each pre-seeded Barry Itabuna slot from
-- the client's official list. Idempotent: re-running just re-applies the same
-- values. Does NOT touch inspection status/photos — only the fixed registry
-- attributes (type and sector) so reports show the correct sector.
-- =============================================================================
-- 85 extintores Barry Itabuna (192–276)
UPDATE extintores SET tipo_carga='AP', setor='área externa resíduos Nestle' WHERE regiao='Barry Itabuna' AND numero_int=192;
UPDATE extintores SET tipo_carga='CO2', setor='área externa resíduos Nestle' WHERE regiao='Barry Itabuna' AND numero_int=193;
UPDATE extintores SET tipo_carga='AP', setor='vestiário terceiros' WHERE regiao='Barry Itabuna' AND numero_int=194;
UPDATE extintores SET tipo_carga='ABC 8kg', setor='vestiário terceiros' WHERE regiao='Barry Itabuna' AND numero_int=195;
UPDATE extintores SET tipo_carga='AP', setor='vestiário terceiros Nestle' WHERE regiao='Barry Itabuna' AND numero_int=196;
UPDATE extintores SET tipo_carga='ABC 8kg', setor='vestiário terceiros Nestle' WHERE regiao='Barry Itabuna' AND numero_int=197;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='próximo estoque GRSA' WHERE regiao='Barry Itabuna' AND numero_int=198;
UPDATE extintores SET tipo_carga='AP', setor='próximo estoque GRSA' WHERE regiao='Barry Itabuna' AND numero_int=199;
UPDATE extintores SET tipo_carga='AP', setor='próximo sala de jogos Nestle' WHERE regiao='Barry Itabuna' AND numero_int=200;
UPDATE extintores SET tipo_carga='AP', setor='entrada do refeitório' WHERE regiao='Barry Itabuna' AND numero_int=201;
UPDATE extintores SET tipo_carga='CO2', setor='entrada do refeitório' WHERE regiao='Barry Itabuna' AND numero_int=202;
UPDATE extintores SET tipo_carga='AP', setor='em frente auditório' WHERE regiao='Barry Itabuna' AND numero_int=203;
UPDATE extintores SET tipo_carga='CO2', setor='em frente auditório' WHERE regiao='Barry Itabuna' AND numero_int=204;
UPDATE extintores SET tipo_carga='CO2', setor='auditório' WHERE regiao='Barry Itabuna' AND numero_int=205;
UPDATE extintores SET tipo_carga='CO2', setor='ADM Nestle' WHERE regiao='Barry Itabuna' AND numero_int=206;
UPDATE extintores SET tipo_carga='CO2', setor='ADM Nestle' WHERE regiao='Barry Itabuna' AND numero_int=207;
UPDATE extintores SET tipo_carga='CO2', setor='ADM Nestle' WHERE regiao='Barry Itabuna' AND numero_int=208;
UPDATE extintores SET tipo_carga='BC 6kg', setor='ADM Nestle' WHERE regiao='Barry Itabuna' AND numero_int=209;
UPDATE extintores SET tipo_carga='CO2', setor='ADM Nestle' WHERE regiao='Barry Itabuna' AND numero_int=210;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='guarita Nestle' WHERE regiao='Barry Itabuna' AND numero_int=211;
UPDATE extintores SET tipo_carga='CO2', setor='substação Nestle' WHERE regiao='Barry Itabuna' AND numero_int=212;
UPDATE extintores SET tipo_carga='AP', setor='sala de comando caldeira biomassa Nestle' WHERE regiao='Barry Itabuna' AND numero_int=213;
UPDATE extintores SET tipo_carga='CO2', setor='sala de comando caldeira biomassa Nestle' WHERE regiao='Barry Itabuna' AND numero_int=214;
UPDATE extintores SET tipo_carga='AP', setor='sala de comando caldeira biomassa Nestle' WHERE regiao='Barry Itabuna' AND numero_int=215;
UPDATE extintores SET tipo_carga='CO2', setor='sala de painéis Nestle' WHERE regiao='Barry Itabuna' AND numero_int=216;
UPDATE extintores SET tipo_carga='AP', setor='próximo sala controle caldeira Nestle' WHERE regiao='Barry Itabuna' AND numero_int=217;
UPDATE extintores SET tipo_carga='AP', setor='próximo sala controle caldeira Nestle' WHERE regiao='Barry Itabuna' AND numero_int=218;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=219;
UPDATE extintores SET tipo_carga='ABC 8kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=220;
UPDATE extintores SET tipo_carga='ABC 8kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=221;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=222;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=223;
UPDATE extintores SET tipo_carga='ABC 4kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=224;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=225;
UPDATE extintores SET tipo_carga='CO2', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=226;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=227;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=228;
UPDATE extintores SET tipo_carga='BC 6kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=229;
UPDATE extintores SET tipo_carga='ABC 8kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=230;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=231;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=232;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=233;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=234;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=235;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=236;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=237;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=238;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=239;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=240;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=241;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=242;
UPDATE extintores SET tipo_carga='ABC 8kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=243;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=244;
UPDATE extintores SET tipo_carga='ABC 8kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=245;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=246;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=247;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=248;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=249;
UPDATE extintores SET tipo_carga='CO2', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=250;
UPDATE extintores SET tipo_carga='AP', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=251;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=252;
UPDATE extintores SET tipo_carga='CO2', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=253;
UPDATE extintores SET tipo_carga='BC 6kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=254;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=255;
UPDATE extintores SET tipo_carga='CO2', setor='Nestle produto acabado' WHERE regiao='Barry Itabuna' AND numero_int=256;
UPDATE extintores SET tipo_carga='AP', setor='docas Nestle' WHERE regiao='Barry Itabuna' AND numero_int=257;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='docas Nestle' WHERE regiao='Barry Itabuna' AND numero_int=258;
UPDATE extintores SET tipo_carga='BC 6kg', setor='docas Nestle' WHERE regiao='Barry Itabuna' AND numero_int=259;
UPDATE extintores SET tipo_carga='ABC 8kg', setor='docas Nestle' WHERE regiao='Barry Itabuna' AND numero_int=260;
UPDATE extintores SET tipo_carga='AP', setor='área externa fundo Nestle' WHERE regiao='Barry Itabuna' AND numero_int=261;
UPDATE extintores SET tipo_carga='AP', setor='tanque desativado Nestle' WHERE regiao='Barry Itabuna' AND numero_int=262;
UPDATE extintores SET tipo_carga='BC 6kg', setor='tanque desativado Nestle' WHERE regiao='Barry Itabuna' AND numero_int=263;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='tanque desativado Nestle' WHERE regiao='Barry Itabuna' AND numero_int=264;
UPDATE extintores SET tipo_carga='ABC 8kg', setor='tanque desativado Nestle' WHERE regiao='Barry Itabuna' AND numero_int=265;
UPDATE extintores SET tipo_carga='BC 6kg', setor='GLP neste' WHERE regiao='Barry Itabuna' AND numero_int=266;
UPDATE extintores SET tipo_carga='CO2', setor='GLP Nestle' WHERE regiao='Barry Itabuna' AND numero_int=267;
UPDATE extintores SET tipo_carga='CO2', setor='área externa Nestle' WHERE regiao='Barry Itabuna' AND numero_int=268;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='estoque produto químicos Nestle' WHERE regiao='Barry Itabuna' AND numero_int=269;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='material inflamável Nestle' WHERE regiao='Barry Itabuna' AND numero_int=270;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='material inflamável Nestle' WHERE regiao='Barry Itabuna' AND numero_int=271;
UPDATE extintores SET tipo_carga='CO2', setor='sala de tintas Nestle' WHERE regiao='Barry Itabuna' AND numero_int=272;
UPDATE extintores SET tipo_carga='ABC 6kg', setor='refeitório' WHERE regiao='Barry Itabuna' AND numero_int=273;
UPDATE extintores SET tipo_carga='CO2 10kg', setor='carretinha refeitório' WHERE regiao='Barry Itabuna' AND numero_int=274;
UPDATE extintores SET tipo_carga='BC 8kg', setor='sala de ar comprimido' WHERE regiao='Barry Itabuna' AND numero_int=275;
UPDATE extintores SET tipo_carga='CO2', setor='casa de bombas' WHERE regiao='Barry Itabuna' AND numero_int=276;

