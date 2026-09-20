<?php
require_once("../../acess_bompastor/conexao.php");
require_once("../../acess_bompastor/util.php");
/*******************************************************************
IMPRESSÃO PDF CONTRATO PLANO TOTAL MAIS
*******************************************************************/

//Recebe dados
if (@$_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"]<>'' and @$_GET["skdfeioHHHksdjskJJ"]<>''){
	$cpf = $_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"];
	$pedido = $_GET["skdfeioHHHksdjskJJ"];
	//decodifica
	$cpf = base64_decode(strrev(base64_decode(base64_decode($cpf))));
	$pedido = base64_decode(strrev(base64_decode(base64_decode($pedido))));

	include("api_bomdescanso_recepcao/api_descanso_pesquisa_titular.php");
	include("api_bomdescanso_recepcao/api_descanso_titular.php");
	include("api_bomdescanso_recepcao/api_descanso_dependentes.php");
	include("api_bomdescanso_recepcao/api_dados_cob_descanso.php");
	include("api_bomdescanso_recepcao/api_descanso_cremacao.php");
	include("api_bomdescanso_recepcao/api_descanso_tanotapraxia.php");
	include("api_bomdescanso_recepcao/api_descanso_quilometragem.php");

	if ($data_emissao<>''){
		$dia_emissao = Pega_dia($data_emissao);
		$mes_emissao = Pega_mes($data_emissao);
		$ano_emissao = Pega_ano($data_emissao);
	}else{
		$dia_emissao = date("d");
		$mes_emissao = date("m");
		$ano_emissao = date("Y");
	}
	$mes_emissao = Retorna_mes($mes_emissao);//descrição
	
	/***************************************************************
	GERAÇÃO DE PDF
	****************************************************************/
	require_once("fpdf/fpdf.php");
	$pdf=new FPDF('P', 'mm', 'A4');// relatório em orientação "paisagem" 
	//$pdf->Open();
	$pdf->SetAutoPageBreak(true, 1);
	$pdf->SetDisplayMode(100);//ZOOM DE 100%
	$altura = 5;
	//##############################################################################

	//PÁGINA 1 ####################
	
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x = 25;
	$y += 47;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($adesao), 0);//contorno
	
	$x = 65;
	//Plano Padrão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($cob_total_valor), 0);//contorno

	$x = 100;
	//Dependente(adicional)
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($total_valor_cremacao), 0);//contorno

	if ($valor_bom_med>1){
		$x = 135;
		//Dependente(adicional)
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, Formata_valor($valor_bom_med), 0);//contorno
	}else{
		$x = 135;
		//Dependente(adicional)
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, ' 0,00', 0);//contorno
		$valor_bom_med=0;
	}
	$mensalidade_total=0;
	$mensalidade_total = $cob_total_valor + $total_valor_cremacao + $valor_bom_med;
	
	$x = 175;
	//Mensalidade total
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($mensalidade_total), 0);//contorno

	
///**********TITULAR
	$y += 8.5;
	$x = 25;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno

	//Sexo
	if ($sexo=='MASCULINO'){
		$x = 147;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($sexo=='FEMININO'){
		$x = 151;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	//Est. Civil
	if ($estado_civil=='SOLTEIRO'){
		$x = 159;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if($estado_civil=='CASADO'){
		$x = 164;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if($estado_civil=='OUTROS'){
		$x = 169;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	//Data de nascimento
	if ($data_nascimento<>''){
		$data_nasc = explode('-',$data_nascimento);
		$temp = $data_nasc[2].'    '.$data_nasc[1].'   '.$data_nasc[0];
	
		$x = 180;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $temp, 0);//contorno
	}
	$y += 8;
	$x = 25;
	//CPF Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $documento, 0);//contorno

	$x += 90;
	//RG Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $rg, 0);//contorno

	$y += 7.5;
	$x = 25;
	$uniao_endereco='';
	if ($complemento<>''){
		$uniao_endereco = $endereco.' - '.$complemento; 
	}else{
		$uniao_endereco = $endereco; 
	}
	//Endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(157, $altura, utf8_decode($uniao_endereco), 0);//contorno

	$x = 186;
	//Número endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(18, $altura, $numero, 0);//contorno

	$y += 7;
	$x = 25;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(78, $altura, utf8_decode($bairro), 0);//contorno

	$x += 83;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(93, $altura, utf8_decode($cidade), 0);//contorno

	$y += 7;
	$x = 25;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $sigla, 0);//contorno

	$x +=11;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(2, $altura, $codigo_postal, 0);//contorno

	$x += 42;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(52, $altura, $telefone1, 0);//contorno

	$x += 55;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(67, $altura, $telefone2, 0);//contorno


//**** NOVA LINHA
	$y += 8;
	$x = 25;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, utf8_decode($profissao), 0);//contorno

	$x = 70;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $renda, 0);//contorno

	/*$x = 115;
	//Empresa
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(42, $altura, $empresa, 0);//contorno
*/

	$x = 160;
	//Cidade Titular
	$pdf->SetFont('times', '', 8);
	$pdf->SetXY($x, $y);
	$pdf->Cell(43, $altura, $email, 0);//contorno

	if($parentes_tem==1){
		$x=25;
		for($i=0; $i<count($parentes); $i++){
			$dados_parentes = $parentes[$i];
			$dep_data_nascimento = $dados_parentes[2];
			$dep_nome_pessoa = $dados_parentes[3];
			$dep_sexo = $dados_parentes[6];
			$dep_parentesco = $dados_parentes[7];
			$tem_bm = $dados_parentes[8];
			if($dep_parentesco=='Pai'){
				$x=25;
				$y=100;
			}
			if($dep_parentesco=='Mãe'){	
				$x=25;
				$y=107;
			}
			if($dep_parentesco=='Sogro/Sogra' and $dep_sexo=='M'){				
				$x=25;
				$y=114;
			}
			if($dep_parentesco=='Sogro/Sogra' and $dep_sexo=='F'){				
				$x=25;
				$y=120;
			}
			if($dep_parentesco=='Cônjuge'){
				$x=25;
				$y=126;
			}
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno
									
			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'      '.$data_nasc[1].'    '.$data_nasc[0];
							
				$x = 172;
				$pdf->SetFont('times', '', 10);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
			if($tem_bm==1){
				$x = 197;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'Sim', 0);//contorno
			}
		}
	}
	if(count($filhos)>0){
		$x=25;
		$y=132;
		for($i=0; $i<count($filhos); $i++){
			$dados_filhos = $filhos[$i];
			$dep_data_nascimento = $dados_filhos[2];
			$dep_nome_pessoa = $dados_filhos[3];
			$dep_sexo = $dados_filhos[6];
			$dep_parentesco = $dados_filhos[7];
			$tem_bm = $dados_filhos[8];
			$x=25;
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno

			//Data de nascimento
			if ($dep_sexo=='M'){
				$x = 156;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}else{
				$x = 158.5;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}
			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'      '.$data_nasc[1].'    '.$data_nasc[0];
							
				$x = 172;
				$pdf->SetFont('times', '', 10);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
			if($tem_bm==1){
				$x = 197;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'Sim', 0);//contorno
			}
			$y +=6.5;
		}
	}
	if($dependentes_tem==1){
		$x = 25;
		$y = 189;
		
		for($i=0; $i<count($dependentes); $i++){
			$dados_dependentes = $dependentes[$i];
			$dep_data_nascimento = $dados_dependentes[2];
			$dep_nome_pessoa = $dados_dependentes[3];
			$dep_sexo = $dados_dependentes[6];
			$dep_parentesco = $dados_dependentes[7];
			$tem_bm = $dados_dependentes[8];
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno
					
			//Data de nascimento
			if ($dep_sexo=='M'){
				$x = 156;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}else{
				$x = 158.5;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}
			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'      '.$data_nasc[1].'    '.$data_nasc[0];
							
				$x = 172;
				$pdf->SetFont('times', '', 10);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
			if($tem_bm==1){
				$x = 197;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'Sim', 0);//contorno
			}
			$y +=6.5;
			$x=25;
		}
	}

//OBSERVAÇÃO
//*************************************
/*
	$x = 25;
	$y = 220;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 9);
	$pdf->MultiCell(180, $altura, utf8_decode($observacoes), 0, "L");//contorno
*/
//*******DATA **********
	$y = 201;
	//****TIPO DE COBRANÇA**********
	if ($plano_pagamento==32922780){
		//Tipo de cobrança
		$x = 111;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($plano_pagamento==25451 or $plano_pagamento==48296791 or $plano_pagamento==40564923 or $plano_pagamento==48286734 or $plano_pagamento==1643483 or $plano_pagamento==48295856 or $plano_pagamento==82623870){
		//Tipo de cobrança
		$x = 148.5;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($plano_pagamento==46285 or $plano_pagamento==47214448 or $plano_pagamento==48395023 or $plano_pagamento==88733784){
		//Tipo de Cobrança
		$x = 166.5;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
//*******DATA **********
	$y = 207;
	$x = 36;
	//Data
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(8, $altura, $dia_emissao);
	$pdf->SetXY($x+14, $y);
	$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+38, $y);
	$pdf->Cell(8, $altura, $ano_emissao);


///*******************VENCIMENTO
	$y += 10;
	
	if ($plano_pagamento<>32922780){		
		//Vencimento
		if ($vencimento=='10'){
			$x = 107;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		//Vencimento
		if ($vencimento=='15'){
			$x = 126;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		//Vencimento
		if ($vencimento=='20'){
			$x = 145;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		//Vencimento
		if ($vencimento=='25'){
			$x = 164;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
	}
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_08.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 6 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_09.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 7 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_10.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


	//PÁGINA 8 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_11.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	

	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_12.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$ano1=$ano_emissao[2];
	$ano2=$ano_emissao[3];
	$ano_final=$ano1.$ano2;

	$x = 130;
	$y = 230;
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+20, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+61, $y);
	$pdf->Cell(30, $altura, $ano_final);
	
	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_13.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	if (count($bom_med)>0){
		/////////************ BOM MED
		//PÁGINA 10 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_descanso/contrato_14.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
		$x = 25;
		$y = 62;
		//Cliente
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno
		//Sexo
		$x = 146;
		if ($sexo=='MASCULINO'){
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		$x = 152;
		if ($sexo=='FEMININO'){
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		$x = 158;
		if ($estado_civil=='SOLTEIRO'){
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		$x = 165;
		if($estado_civil=='CASADO'){
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		$x = 170;
		if($estado_civil=='OUTROS'){
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		
		//Data de nascimento
		$data_nasc=date("Y-m-d");
		if ($data_nascimento<>''){
			$data_nasc = explode('-',$data_nascimento);
			$temp = $data_nasc[2].'     '.$data_nasc[1].'    '.$data_nasc[0];
		
			$x = 178;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, $temp, 0);//contorno
		}
		$y = 69;
		$x = 25;
		//CPF Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $documento, 0);//contorno
	
		//RG Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x+92, $y);
		$pdf->Cell(118, $altura, $rg, 0);//contorno
	
		$y = 77;
		$x = 25;
		//Endereço Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(157, $altura, utf8_decode($endereco), 0);//contorno
	
		$x = 187;
		//Número endereço Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(18, $altura, $numero, 0);//contorno
	
		$y = 84;
		$x = 25;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(78, $altura, utf8_decode($bairro), 0);//contorno
	
		$x += 84;
		//Cidade Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(93, $altura, utf8_decode($cidade), 0);//contorno
	
		$y += 7.5;
		$x = 25;
		//Estado endereço Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $sigla, 0);//contorno
	
		$x +=11;
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(2, $altura, $codigo_postal, 0);//contorno
	
		$x += 44;
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(52, $altura, $telefone1, 0);//contorno
	
		$x += 55;
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(67, $altura, $telefone2, 0);//contorno
		
		//**** NOVA LINHA
		$y += 7;
		$x = 25;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, $profissao, 0);//contorno
	
		$x = 107;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, $email, 0);//contorno
		
		
		if($parentes_tem==1){
			$x=25;
			for($i=0; $i<count($parentes); $i++){
				$dados_parentes = $parentes[$i];
				$dep_telefone = $dados_parentes[1];
				$dep_data_nascimento = $dados_parentes[2];
				$dep_nome_pessoa = $dados_parentes[3];
				$dep_cpf = $dados_parentes[4];
				$dep_sexo = $dados_parentes[6];
				$dep_parentesco = $dados_parentes[7];
				$tem_bm = $dados_parentes[8];
				if ($tem_bm==1){
					if($dep_parentesco=='Pai'){
						$x=25;
						$y=107;
					}
					if($dep_parentesco=='Mãe'){	
						$x=25;
						$y=115;
					}
					if($dep_parentesco=='Sogro/Sogra' and $dep_sexo=='M'){				
						$x=25;
						$y=122;
					}
					if($dep_parentesco=='Sogro/Sogra' and $dep_sexo=='F'){				
						$x=25;
						$y=129;
					}
					if($dep_parentesco=='Cônjuge'){
						$x=25;
						$y=136;
					}
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno

					$x=93;
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(118, $altura, $dep_cpf, 0);//contorno

					$x=133;
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(118, $altura, $dep_telefone, 0);//contorno

					//Data de nascimento
					if ($dep_data_nascimento<>''){
						$data_nasc = explode('-',$dep_data_nascimento);
						$temp = $data_nasc[2].'    '.$data_nasc[1].'   '.$data_nasc[0];
									
						$x = 179;
						$pdf->SetFont('times', '', 9);
						$pdf->SetXY($x, $y);
						$pdf->Cell(4, $altura, $temp, 0);//contorno
					}
					if($tem_bm==1){
						$x = 198;
						$pdf->SetFont('times', '', 11);
						$pdf->SetXY($x, $y);
						$pdf->Cell(4, $altura, 'X', 0);//contorno
					}
				}
			}
		}
		if($filhos_tem==1){
			$x=25;
			$y=144;
			for($i=0; $i<count($filhos); $i++){
				$dados_filhos = $filhos[$i];
				$dep_telefone = $dados_filhos[1];
				$dep_data_nascimento = $dados_filhos[2];
				$dep_nome_pessoa = $dados_filhos[3];
				$dep_cpf = $dados_filhos[4];
				$dep_sexo = $dados_filhos[6];
				$dep_parentesco = $dados_filhos[7];
				$tem_bm = $dados_filhos[8];
				if ($tem_bm==1){
					$x=25;
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno

					$x=93;
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(118, $altura, $dep_cpf, 0);//contorno

					$x=133;
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(118, $altura, $dep_telefone, 0);//contorno

					//Data de nascimento
					if ($dep_sexo=='M'){
						$x = 163;
						$pdf->SetFont('times', '', 11);
						$pdf->SetXY($x, $y);
						$pdf->Cell(4, $altura, 'x', 0);//contorno
					}else{
						$x = 165;
						$pdf->SetFont('times', '', 11);
						$pdf->SetXY($x, $y);
						$pdf->Cell(4, $altura, 'x', 0);//contorno
					}

					//Data de nascimento
					if ($dep_data_nascimento<>''){
						$data_nasc = explode('-',$dep_data_nascimento);
						$temp = $data_nasc[2].'    '.$data_nasc[1].'   '.$data_nasc[0];
									
						$x = 179;
						$pdf->SetFont('times', '', 9);
						$pdf->SetXY($x, $y);
						$pdf->Cell(4, $altura, $temp, 0);//contorno
					}
					if($tem_bm==1){
						$x = 198;
						$pdf->SetFont('times', '', 11);
						$pdf->SetXY($x, $y);
						$pdf->Cell(4, $altura, 'X', 0);//contorno
					}
					$y +=7;
				}
			}
		}
		if($dependentes_tem==1){
			$x = 25;
			$y = 209;
			
			for($i=0; $i<count($dependentes); $i++){
				$dados_dependentes = $dependentes[$i];
				$dep_telefone = $dados_dependentes[1];
				$dep_data_nascimento = $dados_dependentes[2];
				$dep_nome_pessoa = $dados_dependentes[3];
				$dep_cpf = $dados_dependentes[4];
				$dep_sexo = $dados_dependentes[6];
				$dep_parentesco = $dados_dependentes[7];
				$tem_bm = $dados_dependentes[8];
				if ($tem_bm==1){
					$x=25;
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno

					$x=93;
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(118, $altura, $dep_cpf, 0);//contorno

					$x=133;
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(118, $altura, $dep_telefone, 0);//contorno

					//Sexo
					if ($dep_sexo=='M'){
						$x = 162.5;
						$pdf->SetFont('times', '', 11);
						$pdf->SetXY($x, $y);
						$pdf->Cell(4, $altura, 'x', 0);//contorno
					}else{
						$x = 165;
						$pdf->SetFont('times', '', 11);
						$pdf->SetXY($x, $y);
						$pdf->Cell(4, $altura, 'x', 0);//contorno
					}
					
					//Data de nascimento
					if ($dep_data_nascimento<>''){
						$data_nasc = explode('-',$dep_data_nascimento);
						$temp = $data_nasc[2].'    '.$data_nasc[1].'   '.$data_nasc[0];
									
						$x = 179;
						$pdf->SetFont('times', '', 9);
						$pdf->SetXY($x, $y);
						$pdf->Cell(4, $altura, $temp, 0);//contorno
					}
					if($tem_bm==1){
						$x = 198;
						$pdf->SetFont('times', '', 11);
						$pdf->SetXY($x, $y);
						$pdf->Cell(4, $altura, 'X', 0);//contorno
					}
					$y +=7;
					$x=25;
				}
			}
		}
		
	//OBSERVAÇÃO
	//*************************************
	$x = 25;
	$y = 224;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 9);
	$pdf->MultiCell(180, $altura, utf8_decode($observacoes), 0, "L");//contorno
	
	//*******DATA **********
		$y = 240.5;
		$x = 32;
		//Data
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(8, $altura, $dia_emissao);
		$pdf->SetXY($x+15, $y);
		$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+42, $y);
		$pdf->Cell(8, $altura, $ano_emissao);
	
		//TAXA MENSAL
		$x = 120;
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(52, $altura, Formata_valor($valor_bom_med), 0);//contorno
		
		//****TIPO DE COBRANÇA**********
		if ($plano_pagamento==25451 or $plano_pagamento==48296791 or $plano_pagamento==40564923 or $plano_pagamento==48286734 or $plano_pagamento==1643483 or $plano_pagamento==48295856 or $plano_pagamento==82623870){
			//Tipo de cobrança
			$x = 157;
			$pdf->SetFont('times', '', 10);
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if ($plano_pagamento==46285 or $plano_pagamento==47214448 or $plano_pagamento==48395023 or $plano_pagamento==88733784){		
			//Tipo de Cobrança
			$x = 175;
			$pdf->SetFont('times', '', 10);
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		
		//PÁGINA 11 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_descanso/contrato_15.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
		//PÁGINA 12 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_descanso/contrato_16.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
		//PÁGINA 13 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_descanso/contrato_17.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

		//PÁGINA 13 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_descanso/contrato_18.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
		
		$ano1=$ano_emissao[2];
		$ano2=$ano_emissao[3];
		$ano_final=$ano1.$ano2;
		
		$x = 130;
		$y = 240;
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+18, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+60, $y);
		$pdf->Cell(30, $altura, $ano_final);
		
	}
	
	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_19.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

///**********TITULAR
	$y = 50;
	$x = 25;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno

	//Sexo
	if ($sexo=='MASCULINO'){
		$x = 147;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($sexo=='FEMININO'){
		$x = 151;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	//Est. Civil
	if ($estado_civil=='SOLTEIRO'){
		$x = 159;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if($estado_civil=='CASADO'){
		$x = 164;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if($estado_civil=='OUTROS'){
		$x = 169;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	//Data de nascimento
	if ($data_nascimento<>''){
		$data_nasc = explode('-',$data_nascimento);
		$temp = $data_nasc[2].'    '.$data_nasc[1].'   '.$data_nasc[0];
	
		$x = 180;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $temp, 0);//contorno
	}
	$y += 8;
	$x = 25;
	//CPF Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $documento, 0);//contorno

	$x += 90;
	//RG Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $rg, 0);//contorno

	$y += 7.5;
	$x = 25;
	$uniao_endereco='';
	if ($complemento<>''){
		$uniao_endereco = $endereco.' - '.$complemento; 
	}else{
		$uniao_endereco = $endereco; 
	}
	//Endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(157, $altura, utf8_decode($uniao_endereco), 0);//contorno

	$x = 186;
	//Número endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(18, $altura, $numero, 0);//contorno

	$y += 8;
	$x = 25;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(78, $altura, utf8_decode($bairro), 0);//contorno

	$x += 83;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(93, $altura, utf8_decode($cidade), 0);//contorno

	$y += 8;
	$x = 25;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $sigla, 0);//contorno

	$x +=11;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(2, $altura, $postal, 0);//contorno

	$x += 42;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(52, $altura, $telefone1, 0);//contorno

	$x += 55;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(67, $altura, $telefone2, 0);//contorno


//**** NOVA LINHA
	$y += 8;
	$x = 25;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $profissao, 0);//contorno

	$x = 70;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $renda, 0);//contorno

	$x = 110;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(43, $altura, $email, 0);//contorno
	
	//PÁGINA 19 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_descanso/contrato_20.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	$ano1=$ano_emissao[2];
	$ano2=$ano_emissao[3];
	$ano_final=$ano1.$ano2;
	
	$x = 115;
	$y = 233;
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+18, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+59, $y);
	$pdf->Cell(30, $altura, $ano_final);

	if($total_valor_cremacao>0){	
		//PÁGINA ADENDO CREMAÇÃO####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_descanso/cremacao.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
		
		//**** NOVA LINHA
		$y = 157;
		$x = 60;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, $total_valor_cremacao, 0);//contorno

		//**** NOVA LINHA
		$y = 157;
		$x = 77;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, 'REAIS', 0);//contorno

		$x = 125;
		$y = 241;
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+18, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+59, $y);
		$pdf->Cell(30, $altura, $ano_final);
	}
	if($total_valor_tanotapraxia>0){	
		//PÁGINA ADENDO CREMAÇÃO####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_descanso/tanatopraxia.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
		
		//**** NOVA LINHA
		$y = 158.5;
		$x = 98;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, $total_valor_tanotapraxia, 0);//contorno

		//**** NOVA LINHA
		$y = 158.5;
		$x = 130;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, 'REAIS', 0);//contorno

		$x = 125;
		$y = 241;
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+18, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+59, $y);
		$pdf->Cell(30, $altura, $ano_final);
	}
	if($total_valor_quilometragem>0){	
		$quant_km='2000';
		$extenso_km=func_extenso_semreais($quant_km, 0, 0);
		//PÁGINA ADENDO CREMAÇÃO####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_descanso/quilometragem.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
		
		//**** NOVA LINHA
		$y = 93;
		$x = 178;
		//Bairro Titular
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, $quant_km, 0);//contorno

		//**** NOVA LINHA
		$y = 96;
		$x = 16;
		//Bairro Titular
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, $extenso_km, 0);//contorno

		//**** NOVA LINHA
		$y = 128;
		$x = 90;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, $total_valor_quilometragem, 0);//contorno

		//**** NOVA LINHA
		$y = 128;
		$x = 128;
		//Bairro Titular
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, 'REAIS', 0);//contorno
		
		$x = 125;
		$y = 220;
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+18, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+59, $y);
		$pdf->Cell(30, $altura, $ano_final);
	}

	
	$pdf->Output('total_mais'.$pedido.'.pdf', "I");	
}else{
	exit;
}
?>