-- Corrige valores de tipo_imovel_vendido gravados antes da revisão ortográfica
update leads set tipo_imovel_vendido = 'Casa' where tipo_imovel_vendido = 'asa';
update leads set tipo_imovel_vendido = 'Casa em condomínio fechado' where tipo_imovel_vendido = 'casa em condomínio fechado';
update leads set tipo_imovel_vendido = 'Apartamento' where tipo_imovel_vendido = 'apartamento';
update leads set tipo_imovel_vendido = 'Terreno' where tipo_imovel_vendido = 'terreno';
update leads set tipo_imovel_vendido = 'Terreno em condomínio fechado' where tipo_imovel_vendido = 'terreno em condomínio fechado';
update leads set tipo_imovel_vendido = 'Comercial - Casa' where tipo_imovel_vendido in ('comercial casa', 'comercial - casa');
update leads set tipo_imovel_vendido = 'Comercial - Barracão' where tipo_imovel_vendido = 'comercial - barracão';
