<?php
require_once("../../acess_bompastor/conexao.php");
require_once("../../acess_bompastor/util.php");
/*******************************************************************
IMPRESSÃO PDF CONTRATO BOM AUTO
*******************************************************************/

//Recebe dados
if (@$_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"]<>'' and @$_GET["skdfeioHHHksdjskJJ"]<>''){
	$cpf = $_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"];
	$pedido = $_GET["skdfeioHHHksdjskJJ"];
	//decodifica
	$cpf = base64_decode(strrev(base64_decode(base64_decode($cpf))));
	$pedido = base64_decode(strrev(base64_decode(base64_decode($pedido))));

	include("api_bomauto_recepcao/api_bom_auto_dados_carros.php");
	include("api_bomauto_recepcao/api_bom_auto_pesquisa_titular.php");
	include("api_bomauto_recepcao/api_bom_auto_titular.php");
	include("api_bomauto_recepcao/api_dados_cob_bom_auto.php");


		$dia_emissao = date("d");
		$mes_emissao = date("m");
		$ano_emissao = date("Y");
		$mes_emissao = Retorna_mes($mes_emissao);
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
	$logo = 'contratos/bom_auto/01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_auto/02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_auto/03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x += 25;
	$y += 62;
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
		$x = 152;
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
		$x = 170;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Data de nascimento
	if ($data_nascimento<>''){
		$data_nasc = explode('-',$data_nascimento);
		$temp = $data_nasc[2].'     '.$data_nasc[1].'    '.$data_nasc[0];
	
		$x = 179;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $temp, 0);//contorno
	}
	$y += 7.5;
	$x = 25;
	//CPF Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $documento, 0);//contorno

	$x += 95;
	//RG Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $rg, 0);//contorno

	$y += 8;
	$x = 25;
	$uniao_endereco='';
	//Endereço Titular
	if ($complemento<>''){
		$uniao_endereco = $endereco.' - '.$complemento; 
	}else{
		$uniao_endereco = $endereco; 
	}
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(157, $altura, utf8_decode($uniao_endereco), 0);//contorno

	$x = 185;
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

	$y += 8;
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


	$y += 7.5;
	$x = 25;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $profissao, 0);//contorno

	$x += 82;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(95, $altura, $email, 0);//contorno

	$x = 25;
	$y += 21;

	for($i=0; $i<count($carros); $i++){
		$x = 22;
		$dados_carro = $carros[$i];
		$carro_ano = $dados_carro[0];
		$carro_cor = $dados_carro[1];
		$carro_veiculo = $dados_carro[2];
		$carro_placa = $dados_carro[3];
		$carro_modelo = $dados_carro[4];
		$dep_sexo = $dados_carro[7];
		$cpf_condutor = $dados_carro[8];
		$nome_condutor = $dados_carro[9];
		$estado_civil_condutor = $dados_carro[10];
		/*$dep_cpf = $dados_carro[5];
		$dep_telefone = $dados_carro[6];
		$dep_sexo = $dados_carro[7];
		$dep_data_nasc = $dados_carro[8];
		*/
		/*$dep_nome = $dados_carro[4];
		$dep_sexo = $dados_carro[5];
		$dep_data_nasc = $dados_carro[6];
		$dep_documento = $dados_carro[7];
		$dep_cel = $dados_carro[8];
		*/		
		
		//$carros[] = array($carro_ano, $carro_cor, $carro_veiculo, $carro_placa, $carro_modelo);

		//DADOS DO VEICULO 1 *********************************************
		//*************************************************************
		//Adesão
		$x = 25;
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(90, $altura, $carro_veiculo, 0);//contorno
		
		//PET ID
		$x += 93;
		$pdf->SetXY($x, $y);
		$pdf->Cell(90, $altura, $carro_modelo, 0);//contorno
	
		//CARRO
		$x = 25;
		$y += 7;
		//Cor Carro 1
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(65, $altura, $carro_cor, 0);//contorno
	
		$x += 55;
		//Ano Carro 1
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(48, $altura, $carro_ano, 0);//contorno
		
		$x += 35;
		//Cidade Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(40, $altura, strtoupper($carro_placa), 0);//contorno
	
	
		//DADOS DEPENDENTE 1 *********************************************
		//*************************************************************
		$x = 25;
		$y += 7.5;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($nome_condutor), 0);//contorno
	
		//Sexo
		if ($dep_sexo=='M'){
			$x = 147;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if ($dep_sexo=='F'){
			
			$x = 152;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if($estado_civil_condutor=='SOLTEIRO'){		
			$x = 159;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if($estado_civil_condutor=='CASADO'){
			$x = 164;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if($estado_civil_condutor=='OUTROS'){
			$x = 169;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		//Data de nascimento
	if ($data_nascimento<>''){
		
		$data_nasc = explode('-',$data_nascimento);
		$temp = $data_nasc[2].'    '.$data_nasc[1].'    '.$data_nasc[0];
		
		$x = 179;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $temp, 0);//contorno
	}
		$y += 7;
		$x = 25;
		//CPF Titular
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $cpf_condutor, 0);//contorno
	
		$x = 117;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $telefone1, 0);//contorno

		$y += 10.5;
	}

	//VALOR TAXA MENSAL *********************************************
	//*************************************************************
	$x = 48;
	$y = 218;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($adesao), 0);//contorno

	//*************************************************************
	$x = 110;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($total_valor), 0);//contorno

	//Tipo de Cobrança *********************************************
	//*************************************************************
	if ($plano_pagamento=='BOLETO - DIGITAL' or $plano_pagamento=='CARNE'){
		//Adesão
		$x = 161;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}else{
		//Adesão
		$x = 177.5;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	$ano_reduzido = substr($ano_emissao, 2, 4);
	$x = 132;
	$y += 44.5;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(8, $altura, $dia_emissao);
	$pdf->SetXY($x+17, $y);
	$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+58, $y);
	$pdf->Cell(8, $altura, $ano_reduzido);

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_auto/04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_auto/05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 6 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_auto/06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 07 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_auto/07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x = 112;
	$y = 240;
	$ano_data = substr($data_emissao, 2, 2);//(string, carac inicial, qtde de caracteres)
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+20, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+65, $y);
	$pdf->Cell(30, $altura, $ano_data);
	
	//echo "$pedido<br>";
	
	//ASSINATURA 450x200 -> 45x20
/*	$assinatura = "../../acess_bompastor/assinaturas/$pedido".'.png';
	$x = 125;
	$y = 249;
	$pdf->Image($assinatura, $x, $y, 45, 20, "PNG");
*/
	$pdf->Output('bom_auto'.$pedido.'.pdf', "I");
	$pdf->Output('bom_autopedido.pdf', "I");
}else{
	exit;
}
?>