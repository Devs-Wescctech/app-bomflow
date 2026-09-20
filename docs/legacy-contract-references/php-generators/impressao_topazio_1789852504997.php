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
	
	$conjuge_tem=0;
	
	include("api_topazio_recepcao/api_topazio_pesquisa_titular.php");
	include("api_topazio_recepcao/api_topazio_titular.php");
	include("api_topazio_recepcao/api_topazio_dependentes.php");
	include("api_topazio_recepcao/api_dados_cob_topazio.php");
	include("api_topazio_recepcao/api_dados_coroa_topazio.php");
	include("api_topazio_recepcao/api_dados_translado_topazio.php");
	include("api_topazio_recepcao/api_verifica_pocos_caldas_topazio.php");

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
	$logo = 'contratos/plano_topazio/01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_topazio/02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_topazio/03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_topazio/04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_topazio/05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x = 8;
	$y = 56;
	//Cliente
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno
	//Sexo
	$x = 131;
	if ($sexo=='MASCULINO'){
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	$x = 136;
	if ($sexo=='FEMININO'){
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	$x = 144;
	if ($estado_civil=='SOLTEIRO'){
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	$x = 149;
	if($estado_civil=='CASADO'){
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	$x = 154;
	if($estado_civil=='OUTROS'){
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	
	//Data de nascimento
	$data_nasc=date("Y-m-d");
	if ($data_nascimento<>''){
		$data_nasc = explode('-',$data_nascimento);
		$temp = $data_nasc[2].'     '.$data_nasc[1].'    '.$data_nasc[0];
	
		$x = 162;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $temp, 0);//contorno
	}
	$y = 65;
	$x = 8;
	//CPF Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(100, $altura, $documento, 0);//contorno

	$y = 65;
	$x =100;
	//RG Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura,  $rg, 0);//contorno

	$y = 74;
	$x = 8;
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
	
	$y = 73;
	$x = 170;
	//Número endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(18, $altura, $numero, 0);//contorno

	$y = 83;
	$x = 8;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(78, $altura, utf8_decode($bairro), 0);//contorno

	$y = 82;
	$x += 84;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(93, $altura, utf8_decode($cidade), 0);//contorno

	$y = 92;
	$x = 8;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $sigla, 0);//contorno

	$x = 20;
	$postal1=$codigo_postal[0];
	$postal2=$codigo_postal[1];
	$postal3=$codigo_postal[2];
	$postal4=$codigo_postal[3];
	$postal5=$codigo_postal[4];
	$postal6=$codigo_postal[6];
	$postal7=$codigo_postal[7];
	$postal8=$codigo_postal[8];
	
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

	$x += 44;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(52, $altura, $telefone1, 0);//contorno

	$x += 54;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(67, $altura, $telefone2, 0);//contorno

//**** NOVA LINHA
	$y = 100;
	$x = 8;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $profissao, 0);//contorno

	$x = 90;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(95, $altura, $email, 0);//contorno
	$entra=0;
	if($conjuge_tem==1){
		$y = 110;
		$x = 8;
		//Bairro Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(75, $altura, utf8_decode($conjuge_nome_pessoa), 0);//contorno

		//Data de nascimento
		$data_nasc_conjuge=date("Y-m-d");
		if ($conjuge_data_nascimento<>''){
			$data_nasc_conjuge = explode('-',$conjuge_data_nascimento);
			$temp = $data_nasc_conjuge[2].'     '.$data_nasc_conjuge[1].'    '.$data_nasc_conjuge[0];
		
			$x = 164;
			$pdf->SetXY($x, $y);
			$pdf->Cell(40, $altura, $temp, 0);//contorno
		}
	}
	$x=8;
	if($filhos_tem==1){
		$x=8;
		$y=119;
		for($i=0; $i<count($filhos); $i++){
			$dados_filhos = $filhos[$i];
			$dep_data_nascimento = $dados_filhos[1];
			$dep_nome_pessoa = $dados_filhos[2];
			$dep_sexo = $dados_filhos[3];
			$dep_parentesco = $dados_filhos[4];
			
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno

			//Sexo
			$x = 147;
			if ($dep_sexo=='M'){
				$pdf->SetXY($x, $y-1);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}
			$x = 150;
			if ($dep_sexo=='F'){
				$pdf->SetXY($x, $y-1);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}

			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'     '.$data_nasc[1].'     '.$data_nasc[0];
							
				$x = 164;
				$pdf->SetFont('times', '', 10);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
			$y +=9;
			$x=8;
		}
	}

//OBSERVAÇÃO
	$x = 10;
	$y = 215;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 10);
	$pdf->MultiCell(190, 8, utf8_decode($observacoes), 0, "L");//contorno

	//TAXA MENSAL
	$y=237;
	$x = 160;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(52, $altura, Formata_valor($cob_total_valor), 0);//contorno

//*************************************
//*******DATA **********
	$y = 241;
	$x = 16;
	//Data
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(8, $altura, $dia_emissao);
	$pdf->SetXY($x+15, $y);
	$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+42, $y);
	$pdf->Cell(8, $altura, $ano_emissao);

	
	//****TIPO DE COBRANÇA**********
	//if ($cob_plano_pagamento==1643483 or $cob_plano_pagamento==48286734 or $cob_plano_pagamento==48296791 or $cob_plano_pagamento==25451){
		//Tipo de cobrança
		$y=243;
		$x = 149;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	//}
	/*else{
		//Tipo de Cobrança
		$y=243;		
		$x = 166;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
*/
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_topazio/06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_topazio/07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_topazio/08.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 6 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_topazio/09.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 7 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_topazio/10.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x = 115;
	$y = 215;
	$ano_reduzido = substr($ano_emissao, 2, 4);
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+18, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+59, $y);
	$pdf->Cell(30, $altura, $ano_reduzido);

	if ($descricao_pocos=='POÇOS DE CALDAS - TOPAZIO'){
		//PÁGINA 11 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/plano_topazio/11_adendo_pocos_caldas_ganha_coroa.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

		$x = 113;
		$y = 207;
		$ano_reduzido = substr($ano_emissao, 2, 4);
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+20, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+59, $y);
		$pdf->Cell(30, $altura, $ano_reduzido);
	}
	if($plano=='POÇOS DE CALDAS'){
		//PÁGINA 11 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/plano_topazio/12_adendo_pocos_caldas_cremacao.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

		$x = 41;
		$y = 58;
		//Cliente
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno

		$x = 16;
		$y = 67;
		//Cliente
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $cpf, 0);//contorno

		$x = 115;
		$y = 230;
		$ano_reduzido = substr($ano_emissao, 2, 4);
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+20, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+60, $y);
		$pdf->Cell(30, $altura, $ano_reduzido);
	}
	

	if ($tem_coroa=='SIM'){
		//PÁGINA 13 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/plano_topazio/13_coroa_paga.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

		$x = 190;
		$y = 152;
		//cep Titular
		$pdf->SetFont('times', '', 13);
		$pdf->SetXY($x, $y);
		$pdf->Cell(38, $altura, $total_valor_coroa, 0);//contorno
	
		$valor_extenso_coroa = func_escreve_numero_extenso($total_valor_coroa);
		//$valor_extenso =substr($valor_extenso_temp, 0, 2);
		$y = 157;
		$x=26;
		//cep Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(52, $altura, $valor_extenso_coroa, 0);//contorno

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
		$logo = 'contratos/plano_topazio/14_translado.jpg';//cria nome da imagem de cabecalho
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

	$pdf->Output('plano_topazio'.$pedido.'.pdf', "I");
}else{
	exit;
}

?>