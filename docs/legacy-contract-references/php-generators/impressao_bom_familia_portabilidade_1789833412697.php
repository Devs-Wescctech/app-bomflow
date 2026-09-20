<?php
require_once("../../acess_bompastor/conexao.php");
require_once("../../acess_bompastor/util.php");
/*******************************************************************
IMPRESSÃO PDF CONTRATO BOM FAMILIA
*******************************************************************/

//Recebe dados
if (@$_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"]<>'' and @$_GET["skdfeioHHHksdjskJJ"]<>''){
	$cpf = $_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"];
	$pedido = $_GET["skdfeioHHHksdjskJJ"];

	//decodifica
	$cpf = base64_decode(strrev(base64_decode(base64_decode($cpf))));
	$pedido = base64_decode(strrev(base64_decode(base64_decode($pedido))));

	include("api_bomfamilia_portabilidade_recepcao/api_familia_pesquisa_titular_portabilidade.php");
	include("api_bomfamilia_portabilidade_recepcao/api_familia_titular_portabilidade.php");
	include("api_bomfamilia_portabilidade_recepcao/api_familia_dependentes_portabilidade.php");
	include("api_bomfamilia_portabilidade_recepcao/api_dados_cob_familia_portabilidade.php");
	include("api_bomfamilia_portabilidade_recepcao/api_familia_cremacao_portabilidade.php");
	include("api_bomfamilia_portabilidade_recepcao/api_familia_coroa_portabilidade.php");
	include("api_bomfamilia_portabilidade_recepcao/api_familia_quilometragem_portabilidade.php");
	include("api_bomfamilia_portabilidade_recepcao/api_familia_tanatopraxia_portabilidade.php");


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
	$logo = 'contratos/bom_familia_portabilidade/01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x = 29;
	$y += 58;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $adesao, 0);//contorno
	
	$x = 55;
	//Plano Padrão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($cob_total_valor), 0);//contorno

	$x = 80;
	//Dependente(adicional)
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($total_valor_cremacao), 0);//contorno

	$x = 110;
	//Dependente(adicional)
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($total_valor_coroa), 0);//contorno

	$x = 135;
	//Dependente(adicional)
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($valor_quilometragem), 0);//contorno
	

	$mensalidade_total = 0;
	$mensalidade_total = $cob_total_valor + $total_valor_cremacao + $valor_quilometragem +$total_valor_coroa;
	
	$x = 160;
	//Mensalidade total
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($mensalidade_total), 0);//contorno

	
///**********TITULAR
	$y += 10;
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
	$y += 8.5;
	$x = 25;
	//CPF Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $cpf, 0);//contorno

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

	$y += 7.5;
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

	$y += 8.5;
	$x = 25;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $sigla, 0);//contorno

	$postal1=$codigo_postal[0];
	$postal2=$codigo_postal[1];
	$postal3=$codigo_postal[2];
	$postal4=$codigo_postal[3];
	$postal5=$codigo_postal[4];
	$postal6=$codigo_postal[6];
	$postal7=$codigo_postal[7];
	$postal8=$codigo_postal[8];
	$x +=11;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(2, $altura, $postal1, 0);//contorno
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x+5, $y);
	$pdf->Cell(2, $altura, $postal2, 0);//contorno
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x+10, $y);
	$pdf->Cell(2, $altura, $postal3, 0);//contorno
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x+14, $y);
	$pdf->Cell(2, $altura, $postal4, 0);//contorno
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x+19, $y);
	$pdf->Cell(2, $altura, $postal5, 0);//contorno
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x+27, $y);
	$pdf->Cell(2, $altura, $postal6, 0);//contorno
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x+31, $y);
	$pdf->Cell(2, $altura, $postal7, 0);//contorno
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x+36, $y);
	$pdf->Cell(2, $altura, $postal8, 0);//contorno


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

	$x = 110;
	//Cidade Titular
	$pdf->SetFont('times', '', 8);
	$pdf->SetXY($x, $y);
	$pdf->Cell(43, $altura, $email, 0);//contorno

	if($parentes_tem==1){
		$x=25;
		for($i=0; $i<count($parentes); $i++){
			$dados_parentes = $parentes[$i];
			$dep_telefone = $dados_parentes[1];
			$dep_data_nascimento = $dados_parentes[2];
			$dep_nome_pessoa = $dados_parentes[3];
			$dep_sexo = $dados_parentes[6];
			$dep_parentesco = $dados_parentes[7];
			$tem_bm = $dados_parentes[8];
			if($dep_parentesco=='Pai'){
				$x=25;
				$y=116;
			}
			if($dep_parentesco=='Mãe'){	
				$x=25;
				$y=123;
			}
			if($dep_parentesco=='Sogro/Sogra' and $dep_sexo=='M'){				
				$x=25;
				$y=130;
			}
			if($dep_parentesco=='Sogro/Sogra' and $dep_sexo=='F'){				
				$x=25;
				$y=137;
			}
			if($dep_parentesco=='Cônjuge'){
				$x=25;
				$y=145;
			}
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno
									
			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'     '.$data_nasc[1].'    '.$data_nasc[0];
							
				$x = 142;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
			//Data de nascimento
			if ($dep_telefone<>''){
						
				$x = 170;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $dep_telefone, 0);//contorno
			}
			if($tem_bm==1){
				$x = 198;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'Sim', 0);//contorno
			}
		}
	}
	if(count($filhos)>0){
		$x=25;
		$y=153;
		for($i=0; $i<count($filhos); $i++){
			$dados_filhos = $filhos[$i];
			$dep_telefone = $dados_filhos[1];			
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
				$x = 125;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}else{
				$x = 128;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}
			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'     '.$data_nasc[1].'    '.$data_nasc[0];
							
				$x = 142;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
			//Data de nascimento
			if ($dep_telefone<>''){
						
				$x = 170;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $dep_telefone, 0);//contorno
			}
			if($tem_bm==1){
				$x = 197;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'Sim', 0);//contorno
			}
			$y +=5.5;
		}
	}

//OBSERVAÇÃO
//*************************************
	$x = 30;
	$y = 205;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 9);
	$pdf->MultiCell(180, $altura, utf8_decode($observacoes), 0, "L");//contorno

	$y = 216.5;
	//****TIPO DE COBRANÇA**********
	if ($cob_plano_pagamento==32922780){
		//Tipo de cobrança
		$x = 111;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($cob_plano_pagamento==25451 or $cob_plano_pagamento==48296791 or $cob_plano_pagamento==40564923 or $cob_plano_pagamento==48286734 or $cob_plano_pagamento==1643483 or $cob_plano_pagamento==48295856 or $cob_plano_pagamento==82623870){
		//Tipo de cobrança
		$x = 148.5;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($cob_plano_pagamento==46285 or $cob_plano_pagamento==47214448 or $cob_plano_pagamento==48395023 or $cob_plano_pagamento==88733784){
		//Tipo de Cobrança
		$x = 166.5;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
//*******DATA **********
	$y = 222;
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
	
	if ($cob_plano_pagamento<>32922780){			
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
	$logo = 'contratos/bom_familia_portabilidade/06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/08.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 6 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/09.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 7 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/10.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 8 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/11.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	

	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/12.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/13.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/14.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/15.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$ano_reduzido = substr($ano_emissao, 2, 4);
	
	$x = 113;
	$y = 188;
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+20, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+61, $y);
	$pdf->Cell(30, $altura, $ano_reduzido);

	
	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/16.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


		/////////************ BOM MED
		//PÁGINA 10 ####################
	
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
		$pdf->Cell(118, $altura, $cpf, 0);//contorno
	
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
	
		$postal1=$codigo_postal[0];
		$postal2=$codigo_postal[1];
		$postal3=$codigo_postal[2];
		$postal4=$codigo_postal[3];
		$postal5=$codigo_postal[4];
		$postal6=$codigo_postal[6];
		$postal7=$codigo_postal[7];
		$postal8=$codigo_postal[8];
		$x +=11;
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(2, $altura, $postal1, 0);//contorno
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x+5, $y);
		$pdf->Cell(2, $altura, $postal2, 0);//contorno
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x+9, $y);
		$pdf->Cell(2, $altura, $postal3, 0);//contorno
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x+14, $y);
		$pdf->Cell(2, $altura, $postal4, 0);//contorno
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x+18, $y);
		$pdf->Cell(2, $altura, $postal5, 0);//contorno
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x+27, $y);
		$pdf->Cell(2, $altura, $postal6, 0);//contorno
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x+31, $y);
		$pdf->Cell(2, $altura, $postal7, 0);//contorno
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x+36, $y);
		$pdf->Cell(2, $altura, $postal8, 0);//contorno
	
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
	
		$x = 106;
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
			for($i=0; $i<count($filhos_bm); $i++){
				$dados_filhos = $filhos_bm[$i];
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

	//OBSERVAÇÃO
	//*************************************
	$x = 25;
	$y = 209;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 9);
	$pdf->MultiCell(180, 6.5, utf8_decode($observacoes), 0, "L");//contorno
	
	//PÁGINA 11 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_familia_portabilidade/17.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


	if ($total_valor_coroa>0){
		//PÁGINA 01 COROA DE FLORES ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_familia_portabilidade/cora_flores.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
		
		$x = 25;
		$y = 95;
		//Cliente
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($quant_coroa), 0);//contorno

		$x = 148;
		$y = 123;
		//Cliente
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, Formata_valor($total_valor_coroa), 0);//contorno
		
		$valor_extenso = func_escreve_numero_extenso($total_valor_coroa, 0, 0);
		$valor_extenso=$valor_extenso.' Reais';
		$x = 25;
		$y = 127;
		//Cliente
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($valor_extenso), 0);//contorno
		
		$ano_reduzido = substr($ano_emissao, 2, 4);
		
		$x = 124;
		$y = 242;
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+20, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+58, $y);
		$pdf->Cell(30, $altura, $ano_reduzido);
	
	}
if($total_valor_cremacao>0){	
		//PÁGINA ADENDO CREMAÇÃO####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_familia_portabilidade/cremacao.jpg';//cria nome da imagem de cabecalho
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

		$ano_reduzido = substr($ano_emissao, 2, 4);
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
	if($total_valor_tanato>0){	
		//PÁGINA ADENDO CREMAÇÃO####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_familia_portabilidade/tanatopraxia.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
		
		//**** NOVA LINHA
		$y = 158.5;
		$x = 98;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, $total_valor_tanato, 0);//contorno

		//**** NOVA LINHA
		$y = 158.5;
		$x = 130;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, 'REAIS', 0);//contorno

		$ano_reduzido = substr($ano_emissao, 2, 4);	
		$x = 125;
		$y = 241;
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+18, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+59, $y);
		$pdf->Cell(30, $altura, $ano_reduzido);
	}
	if($valor_quilometragem>0){	
		$extenso_km=func_extenso_semreais($quant_km, 0, 0);
		//PÁGINA ADENDO CREMAÇÃO####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/bom_familia_portabilidade/quilometragem.jpg';//cria nome da imagem de cabecalho
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
		$pdf->Cell(75, $altura, $valor_quilometragem, 0);//contorno

		//**** NOVA LINHA
		$y = 128;
		$x = 128;
		//Bairro Titular
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, 'REAIS', 0);//contorno
		
		$ano_reduzido = substr($ano_emissao, 2, 4);		
		$x = 125;
		$y = 220;
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+18, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+59, $y);
		$pdf->Cell(30, $altura, $ano_reduzido);
	}
	$pdf->Output('bom_familia_portabilidade_'.$pedido.'.pdf', "I");
	
}else{
	exit;
}

?>