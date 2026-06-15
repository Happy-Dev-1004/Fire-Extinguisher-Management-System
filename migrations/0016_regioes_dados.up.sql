-- =============================================================================
-- MIGRATION 0016: real data for Viveiro Itabuna, Viveiro Ilhéus, CW Ilhéus, CW Itabuna
-- Sets tipo_carga + setor per pre-seeded slot. Idempotent; only touches the
-- registry attributes (type/sector), not inspection status/photos.
-- =============================================================================

-- Viveiro Itabuna (12 extintores)
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Guarita 01' WHERE regiao='Viveiro Itabuna' AND numero_int=1;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Manutenção' WHERE regiao='Viveiro Itabuna' AND numero_int=2;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Almoxarifado' WHERE regiao='Viveiro Itabuna' AND numero_int=3;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='ADM' WHERE regiao='Viveiro Itabuna' AND numero_int=4;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Estoque Fertilizante' WHERE regiao='Viveiro Itabuna' AND numero_int=5;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Estoque Fertilizante' WHERE regiao='Viveiro Itabuna' AND numero_int=6;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Casa de Bombas' WHERE regiao='Viveiro Itabuna' AND numero_int=7;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Banheiros' WHERE regiao='Viveiro Itabuna' AND numero_int=8;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Tanque' WHERE regiao='Viveiro Itabuna' AND numero_int=9;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Viveiro 01' WHERE regiao='Viveiro Itabuna' AND numero_int=10;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Guarita 02' WHERE regiao='Viveiro Itabuna' AND numero_int=11;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Guarita Saída' WHERE regiao='Viveiro Itabuna' AND numero_int=12;

-- Viveiro Ilhéus (17 extintores)
UPDATE extintores SET tipo_carga='Premium', setor='Área externa escritório' WHERE regiao='Viveiro Ilhéus' AND numero_int=1;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='casa fundos próximo mirante' WHERE regiao='Viveiro Ilhéus' AND numero_int=2;
UPDATE extintores SET tipo_carga='Premium', setor='entrada galpão adubo externo' WHERE regiao='Viveiro Ilhéus' AND numero_int=3;
UPDATE extintores SET tipo_carga='Premium', setor='escritório área interna' WHERE regiao='Viveiro Ilhéus' AND numero_int=4;
UPDATE extintores SET tipo_carga='Premium', setor='Galpão adubo entrada externa' WHERE regiao='Viveiro Ilhéus' AND numero_int=5;
UPDATE extintores SET tipo_carga='Premium', setor='Galpão adubo entrada interno' WHERE regiao='Viveiro Ilhéus' AND numero_int=6;
UPDATE extintores SET tipo_carga='Premium', setor='Galpão adubo externo lateral' WHERE regiao='Viveiro Ilhéus' AND numero_int=7;
UPDATE extintores SET tipo_carga='Premium', setor='Galpão adubo interno fundos' WHERE regiao='Viveiro Ilhéus' AND numero_int=8;
UPDATE extintores SET tipo_carga='Premium', setor='Galpão adubo interno lateral' WHERE regiao='Viveiro Ilhéus' AND numero_int=9;
UPDATE extintores SET tipo_carga='Premium', setor='Galpão adubo lateral interno' WHERE regiao='Viveiro Ilhéus' AND numero_int=10;
UPDATE extintores SET tipo_carga='Premium', setor='Galpão fertilizantes interno' WHERE regiao='Viveiro Ilhéus' AND numero_int=11;
UPDATE extintores SET tipo_carga='Premium', setor='Galpão fertilizantes interno' WHERE regiao='Viveiro Ilhéus' AND numero_int=12;
UPDATE extintores SET tipo_carga='Premium', setor='Guarita' WHERE regiao='Viveiro Ilhéus' AND numero_int=13;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Mirante parte debaixo' WHERE regiao='Viveiro Ilhéus' AND numero_int=14;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Mirante parte de cima' WHERE regiao='Viveiro Ilhéus' AND numero_int=15;
UPDATE extintores SET tipo_carga='Premium', setor='Oficina 1' WHERE regiao='Viveiro Ilhéus' AND numero_int=16;
UPDATE extintores SET tipo_carga='Premium', setor='Oficina 2' WHERE regiao='Viveiro Ilhéus' AND numero_int=17;

-- CW Ilhéus (52 extintores)
UPDATE extintores SET tipo_carga='Premium', setor='área externa' WHERE regiao='CW Ilhéus' AND numero_int=1;
UPDATE extintores SET tipo_carga='BC 12kg', setor='área externa' WHERE regiao='CW Ilhéus' AND numero_int=2;
UPDATE extintores SET tipo_carga='BC 12kg', setor='área externa' WHERE regiao='CW Ilhéus' AND numero_int=3;
UPDATE extintores SET tipo_carga='Premium', setor='área externa' WHERE regiao='CW Ilhéus' AND numero_int=4;
UPDATE extintores SET tipo_carga='Premium', setor='área externa' WHERE regiao='CW Ilhéus' AND numero_int=5;
UPDATE extintores SET tipo_carga='CO2 06kg', setor='área externa' WHERE regiao='CW Ilhéus' AND numero_int=6;
UPDATE extintores SET tipo_carga='CO2 06kg', setor='área externa' WHERE regiao='CW Ilhéus' AND numero_int=7;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=8;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=9;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=10;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=11;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=12;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=13;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=14;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=15;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=16;
UPDATE extintores SET tipo_carga='CO2 06kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=17;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=18;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=19;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=20;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=21;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=22;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=23;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=24;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=25;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=26;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=27;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=28;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=29;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=30;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=31;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=32;
UPDATE extintores SET tipo_carga='CO2 06kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=33;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=34;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=35;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=36;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=37;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=38;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=39;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=40;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=41;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=42;
UPDATE extintores SET tipo_carga='Premium', setor='Área depósito' WHERE regiao='CW Ilhéus' AND numero_int=43;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=44;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=45;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=46;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=47;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='Área depósito' WHERE regiao='CW Ilhéus' AND numero_int=48;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=49;
UPDATE extintores SET tipo_carga='ABC 20kg', setor='área depósito' WHERE regiao='CW Ilhéus' AND numero_int=50;
UPDATE extintores SET tipo_carga='BC 12kg', setor='área externa' WHERE regiao='CW Ilhéus' AND numero_int=51;
UPDATE extintores SET tipo_carga='BC 12kg', setor='área externa' WHERE regiao='CW Ilhéus' AND numero_int=52;

-- CW Itabuna (38 extintores)
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Guarita' WHERE regiao='CW Itabuna' AND numero_int=1;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Banheiro Externo' WHERE regiao='CW Itabuna' AND numero_int=2;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Área externa' WHERE regiao='CW Itabuna' AND numero_int=3;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='ADM' WHERE regiao='CW Itabuna' AND numero_int=4;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='ADM 1 ANDAR' WHERE regiao='CW Itabuna' AND numero_int=5;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='Recepção' WHERE regiao='CW Itabuna' AND numero_int=6;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=7;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=8;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=9;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=10;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=11;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=12;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=13;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=14;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=15;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=16;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=17;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=18;
UPDATE extintores SET tipo_carga='Premium', setor='area depósito' WHERE regiao='CW Itabuna' AND numero_int=19;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=20;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=21;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=22;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=23;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=24;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=25;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=26;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=27;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=28;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=29;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=30;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=31;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=32;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=33;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=34;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=35;
UPDATE extintores SET tipo_carga='ABC 06kg', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=36;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=37;
UPDATE extintores SET tipo_carga='Premium', setor='área depósito' WHERE regiao='CW Itabuna' AND numero_int=38;

