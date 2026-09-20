<?php
require_once("../../acess_bompastor/conexao.php");
require_once("../../acess_bompastor/util.php");
/*******************************************************************
IMPRESSÃO PDF CONTRATO BOM med
*******************************************************************/

//Recebe dados
if (@$_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"]<>'' and @$_GET["skdfeioHHHksdjskJJ"]<>''){
	$cpf = $_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"];
	$pedido = $_GET["skdfeioHHHksdjskJJ"];
	//decodifica
	$cpf = base64_decode(strrev(base64_decode(base64_decode($cpf))));
	$pedido = base64_decode(strrev(base64_decode(base64_decode($pedido))));

	include("api_perola_recepcao/api_perola_pesquisa_titular.php");
	include("api_perola_recepcao/api_perola_titular.php");
	include("api_perola_recepcao/api_perola_dependentes.php");
	include("api_perola_recepcao/api_dados_cob_perola.php");
	include("api_perola_recepcao/api_dados_coroa_perola.php");	
	include("api_perola_recepcao/api_dados_translado_perola.php");
	include("api_perola_recepcao/api_dados_cremacao_coroa_perola.php");

	if ($data_emissao<>''){
		$dia_emissao = Pega_dia($data_emissao);
		$mes_emissao = Pega_mes($data_emissao);
		$ano_emissao = Pega_ano($data_emissao);
	}else{
		$dia_emissao = date("d");
		$mes_emissao = date("m");
		$ano_emissao = date("Y");
		$mes_emissao = Retorna_mes($mes_emissao);//descrição
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
	$logo = 'contratos/plano_perola/01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_perola/02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x = 23;
	$y = 52;
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
	$x = 159;
	if ($estado_civil=='SOLTEIRO'){
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	$x = 164;
	if($estado_civil=='CASADO'){
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	$x = 169;
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
	$y = 59;
	$x = 23;
	//CPF Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $documento, 0);//contorno

	//RG Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x+92, $y);
	$pdf->Cell(118, $altura, $rg, 0);//contorno

	$y = 67;
	$x = 23;
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

	$x = 185;
	$numero = substr($numero, 0, 10);
	//Número endereço Titular
	$pdf->SetFont('times', '', 9);
	$pdf->SetXY($x, $y);
	$pdf->Cell(18, $altura, $numero, 0);//contorno

	$y = 74;
	$x = 23;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(78, $altura, utf8_decode($bairro), 0);//contorno

	$x += 84;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(93, $altura, utf8_decode($cidade), 0);//contorno

	$y += 7;
	$x = 23;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $sigla, 0);//contorno

	$x += 14;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(38, $altura, $codigo_postal, 0);//contorno

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
	$x = 23;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $profissao, 0);//contorno

	$x = 106;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(95, $altura, $email, 0);//contorno
	$entra=0;
	if($parentes_tem==1){
		$x=23;
		for($i=0; $i<count($parentes); $i++){
			$dados_parentes = $parentes[$i];
			$dep_data_nascimento = $dados_parentes[2];
			$dep_nome_pessoa = $dados_parentes[3];
			$dep_sexo = $dados_parentes[6];
			$dep_parentesco = $dados_parentes[7];
			if($dep_parentesco=='Pai'){
				$x=23;
				$y=97;
			}
			if($dep_parentesco=='Mãe'){	
				$x=23;
				$y=104;
			}
			if($dep_parentesco=='Sogro/Sogra' and $dep_sexo=='M'){				
				$x=23;
				$y=112;
			}
			if($dep_parentesco=='Sogro/Sogra' and $dep_sexo=='F'){				
				$x=23;
				$y=119;
			}
			if($dep_parentesco=='Cônjuge'){
				$x=23;
				$y=126;
			}
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno
									
			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'     '.$data_nasc[1].'     '.$data_nasc[0];
							
				$x = 180;
				$pdf->SetFont('times', '', 10);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
		}
	}
	if($filhos_tem==1){
		$x=23;
		$y=133.5;
		for($i=0; $i<count($filhos); $i++){
			$dados_filhos = $filhos[$i];
			$dep_data_nascimento = $dados_filhos[2];
			$dep_nome_pessoa = $dados_filhos[3];
			$dep_sexo = $dados_filhos[6];
			$dep_parentesco = $dados_filhos[7];
			
			$x=23;
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno
					
			//Sexo
			$x = 162.5;
			if ($dep_sexo=='M'){
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}
			$x = 165.5;
			if ($dep_sexo=='F'){
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}
					
			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'     '.$data_nasc[1].'     '.$data_nasc[0];
							
				$x = 180;
				$pdf->SetFont('times', '', 10);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
			$y +=7;
		}
	}
	if($dependentes_tem==1){
		$x = 23;
		$y = 199.5;
		
		for($i=0; $i<count($dependentes); $i++){
			$dados_dependentes = $dependentes[$i];
			$dep_data_nascimento = $dados_dependentes[2];
			$dep_nome_pessoa = $dados_dependentes[3];
			$dep_sexo = $dados_dependentes[6];
			$dep_parentesco = $dados_dependentes[7];
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno
									
			//Sexo
			$x = 162.5;
			if ($dep_sexo=='M'){
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}
			$x = 165.5;
			if ($dep_sexo=='F'){
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}
									
			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'     '.$data_nasc[1].'     '.$data_nasc[0];
							
				$x = 180;
				$pdf->SetFont('times', '', 10);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
			$y +=7;
			$x=23;
		}
	}	
//OBSERVAÇÃO
//*************************************
//OBSERVAÇÃO
	$x = 23;
	$y = 212;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 10);
	$pdf->MultiCell(190, 8, utf8_decode($observacoes), 0, "L");//contorno
//*******DATA **********
	$y = 231;
	$x = 34;
	//Data
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(8, $altura, $dia_emissao);
	$pdf->SetXY($x+15, $y);
	$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+42, $y);
	$pdf->Cell(8, $altura, $ano_emissao);

	if ($tem_translado=='SIM'){
		$cob_total_valor = $cob_total_valor + $total_valor_translado;	
	}

	//TAXA MENSAL
	$x = 118;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(52, $altura, Formata_valor($cob_total_valor), 0);//contorno
	
	//****TIPO DE COBRANÇA**********
	//if ($cob_plano_pagamento==1643483 or $cob_plano_pagamento==48286734 or $cob_plano_pagamento==48296791 or $cob_plano_pagamento==25451){
		//Tipo de cobrança
		$x = 168;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	/*}else{
		//Tipo de Cobrança
		$x = 185;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	*/
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_perola/03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_perola/04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_perola/05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 6 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_perola/06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 7 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_perola/07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x = 132;
	$y = 233.5;
	$ano_reduzido = substr($ano_emissao, 2, 4);
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+18, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+59, $y);
	$pdf->Cell(30, $altura, $ano_reduzido);
	
	if ($tem_coroa=='SIM'){
		//PÁGINA 7 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/plano_perola/13_coroa_paga.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

		$x = 190;
		$y = 152;
		//cep Titular
		$pdf->SetFont('times', '', 13);
		$pdf->SetXY($x, $y);
		$pdf->Cell(38, $altura, $total_valor_coroa, 0);//contorno
	
		$valor_extenso = func_escreve_numero_extenso($total_valor_coroa, 0, 0);
		//$valor_extenso =substr($valor_extenso_temp, 0, 2);
		$y = 157;
		$x=26;
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(52, $altura, $valor_extenso, 0);//contorno

		$x = 132;
		$y = 206;
		$ano_reduzido = substr($ano_emissao, 2, 4);
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+18, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+59, $y);
		$pdf->Cell(30, $altura, $ano_reduzido);
	}
	if ($tem_translado=='SIM'){
		//PÁGINA 7 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/plano_perola/14_translado.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

		$x = 173;
		$y = 145;
		//cep Titular
		$pdf->SetFont('times', '', 13);
		$pdf->SetXY($x, $y);
		$pdf->Cell(38, $altura, Formata_valor($total_valor_translado), 0);//contorno

		$valor_extenso = func_escreve_numero_extenso($total_valor_translado);
		//$valor_extenso =substr($valor_extenso_temp, 0, 2);
		$y = 150;
		$x=26;
		$valor_extenso=$valor_extenso.' Reais';
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(52, $altura, $valor_extenso, 0);//contorno


		$x = 132;
		$y = 208;
		$ano_reduzido = substr($ano_emissao, 2, 4);
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+18, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+59, $y);
		$pdf->Cell(30, $altura, $ano_reduzido);
	}
	if ($tem_cremacao_coroa=='SIM'){
		$valor_extenso_cremacao_coroa=0;
		//PÁGINA 7 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/plano_perola/15_cremacao_e_coroa.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

		$x = 59;
		$y = 177;
		//cep Titular
		$pdf->SetFont('times', '', 13);
		$pdf->SetXY($x, $y);
		$pdf->Cell(38, $altura, $total_valor_cremacao_coroa, 0);//contorno

		$valor_extenso_cremacao_coroa = func_escreve_numero_extenso($total_valor_cremacao_coroa);
		//$valor_extenso =substr($valor_extenso_temp, 0, 2);
		$y = 177;
		$x=80;

		//cep Titular
		$pdf->SetFont('times', '', 13);
		$pdf->SetXY($x, $y);
		$pdf->Cell(52, $altura, $valor_extenso_cremacao_coroa, 0);//contorno


		$x = 122;
		$y = 235;
		$ano_reduzido = substr($ano_emissao, 2, 4);
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+18, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+60, $y);
		$pdf->Cell(30, $altura, $ano_reduzido);
	}
	
	$pdf->Output('plano_perola'.$pedido.'.pdf', "I");
}else{
	exit;
}

?>