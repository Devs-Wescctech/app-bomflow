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
	//$cpf='177.697.588-07';
	include("api_bompet_saude_recepcao/api_bom_pet_saude_titular.php");
	include("api_bompet_saude_recepcao/api_bom_pet_saude_dependentes.php");
	include("api_bompet_saude_recepcao/api_dados_cob_bom_pet_saude.php");

	//BUSCA DATA DA ASSINATURA DO CONTRATO
	
	$tb_contratos_assinaturas = @mysqli_query($db, "SELECT * FROM contratos_assinaturas WHERE contrato_numero='$pedido'");
	if (mysqli_num_rows($tb_contratos_assinaturas)<>0){
		$dados_assinatura = mysqli_fetch_array($tb_contratos_assinaturas);
		$data_emissao = $dados_assinatura["data"];
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
	$logo = 'contratos/bom_pet_saude/01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude/02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude/03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude/04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x += 25;
	$y += 79.5;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno

	//Sexo
	if ($sexo=='MASCULINO'){
		$x = 146;
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
		$temp = $data_nasc[2].'    '.$data_nasc[1].'    '.$data_nasc[0];
	
		$x = 179;
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

	$y += 8;
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

	$x = 185;
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

	$y += 7;
	$x = 25;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $sigla, 0);//contorno

	$x += 11;
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


	$y += 8;
	$x = 25;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, utf8_decode($profissao), 0);//contorno

	$x += 82;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(95, $altura, $email, 0);//contorno

	//PERCORRE DEPENDENTES PETS *********************************************
	//*************************************************************
	$x = 27;
	$y += 31;
	
	$idade_calcula = CalcularIdade($data_nasc_pet, 'amd', '-');	
	$tmp = explode('a', $idade_calcula);		
	$anos = $tmp[0];
	$meses = $tmp[1];
	$idade = $anos.' anos '.str_replace('m', ' meses', $meses);

	if($cor1<>''){
		$cor = $cor1;
	}else{$cor='';}
	if($cor2<>''){
		if($cor<>''){
			$cor .=' e '.$cor2;
		}else{
			$cor = $cor2;
		}
	}
	$altura_dependentes = 7.5;

		//IMPRESSÃO DOS DADOS DE CADA PET
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura_dependentes, utf8_decode($nome_pet), 0);//contorno

		if ($sexo_pet=='M'){
			$x = 153;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
		}
		if ($sexo_pet=='F'){
			$x = 157;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
		}

		
		$x = 27;
		$y += 8;
		//Raça Animal 1
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(65, $altura_dependentes, utf8_decode($raca), 0);//contorno
	
		$x += 70;
		//Cidade Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(48, $altura_dependentes, $cor, 0);//contorno
		
		$x = 148;
		//Cidade Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(28, $altura_dependentes, $idade, 0);//contorno
	
	//VALOR TAXA MENSAL *********************************************
	//*************************************************************
	$x = 160;
	$y = 187;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($total_valor), 0);//contorno
		
	//DATA *********************************************
	//*************************************************************
	$x = 35;
	$y += 3;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(8, $altura, $dia_emissao);
	$pdf->SetXY($x+15, $y);
	$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+40, $y);
	$pdf->Cell(8, $altura, $ano_emissao);
			
	//Tipo de Cobrança *********************************************
	//*************************************************************
	$x = 120;
	$y += 3;
	if ($plano_pagamento==46285 or $plano_pagamento==47214448 or $plano_pagamento==48395023 or $plano_pagamento==88733784){		//Adesão
		$x = 148;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($plano_pagamento==25451 or $plano_pagamento==48296791 or $plano_pagamento==40564923 or $plano_pagamento==48286734 or $plano_pagamento==1643483 or $plano_pagamento==48295856 or $plano_pagamento==82623870){
		//Adesão
		$x = 178;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	
	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude/05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 6 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude/06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	///PÁGINA 07 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude/07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	//VERIFICA SE EXISTE ARQUIVO DA FOTO DO DOCUMENTO
	/*$foto_documento = "../../acess_bompastor/documentos/foto_".$pedido.'.png';
	if (file_exists($foto_documento)) {
		$pdf->AddPage();
		$linhas = 1;
		$x = 67.5;
		$y = 98.5;
		$pdf->Image($foto_documento, $x, $y, 100, 75, "PNG");
	}
	*/
	///PÁGINA 08 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude/08.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	///PÁGINA 09 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude/09.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	///PÁGINA 10 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude/10.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	//DATA *********************************************
	//*************************************************************
	$x = 114;
	$y = 181;

	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(8, $altura, $dia_emissao);
	$pdf->SetXY($x+20, $y);
	$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+60, $y);
	$pdf->Cell(30, $altura, substr($ano_emissao, 2, 2));	
	
/*	//ASSINATURA 450x200 -> 45x20
	$assinatura = "../../acess_bompastor/assinaturas/$pedido".'.png';
	$x = 130;
	$y += 21;
	$pdf->SetXY($x, $y);
	$pdf->Image($assinatura, $x, $y, 45, 20, "PNG");
*/
	$pdf->Output('bom_pet_saude'.$pedido.'.pdf', "I");
}else{
	exit;
}
?>