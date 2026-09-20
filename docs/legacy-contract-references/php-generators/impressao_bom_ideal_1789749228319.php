<?php
require_once("../../acess_bompastor/conexao.php");
require_once("../../acess_bompastor/util.php");
/*******************************************************************
IMPRESSÃO PDF CONTRATO BOM IDEAL
*******************************************************************/

//Recebe dados
if (@$_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"]<>'' and @$_GET["skdfeioHHHksdjskJJ"]<>''){
	$cpf = $_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"];
	$pedido = $_GET["skdfeioHHHksdjskJJ"];

	//decodifica
	$cpf = base64_decode(strrev(base64_decode(base64_decode($cpf))));
	$pedido = base64_decode(strrev(base64_decode(base64_decode($pedido))));

	include("api_bomideal_recepcao/api_ideal_pesquisa_titular.php");
	include("api_bomideal_recepcao/api_ideal_titular.php");
	include("api_bomideal_recepcao/api_ideal_dependentes.php");
	include("api_bomideal_recepcao/api_dados_cob_ideal.php");
	include("api_bomideal_recepcao/api_ideal_cremacao.php");
	include("api_bomideal_recepcao/api_ideal_coroa.php");
	include("api_bomideal_recepcao/api_ideal_quilometragem.php");

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
	$logo = 'contratos/bom_ideal/01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/05.jpg';//cria nome da imagem de cabecalho
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
	
	$x = 170;
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

	$x = 25;
	$y +=8; 
	if($conjuge_nome<>''){
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($conjuge_nome), 0);//contorno
	}
									
	//Data de nascimento
	if ($conjuge_data_nascimento<>''){
		$data_nasc = explode('-',$conjuge_data_nascimento);
		$temp = $data_nasc[2].'     '.$data_nasc[1].'    '.$data_nasc[0];
							
		$x = 142;
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $temp, 0);//contorno
	}
	//Data de nascimento
	if ($conjuge_telefone<>''){
		$x = 170;
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $conjuge_telefone, 0);//contorno
	}
	$y +=8;
	for($i=0; $i<count($filhos); $i++){
			$dados_filhos = $filhos[$i];
			$dep_telefone = $dados_filhos[1];
			$dep_data_nascimento = $dados_filhos[2];
			$dep_nome_pessoa = $dados_filhos[3];
			$dep_sexo = $dados_filhos[6];
			$dep_parentesco = $dados_parentes[7];

			$x=25;
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
			$y +=6;
		}
	$y = 152;	
	for($i=0; $i<count($dependentes); $i++){
			$dados_dependentes = $dependentes[$i];
			$dep_telefone = $dados_dependentes[1];
			$dep_data_nascimento = $dados_dependentes[2];
			$dep_nome_pessoa = $dados_dependentes[3];
			$dep_sexo = $dados_dependentes[6];
			$dep_parentesco = $dados_dependentes[7];

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
			$y +=6;
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
	$logo = 'contratos/bom_ideal/06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/08.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 6 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/09.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 7 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/10.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 8 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/11.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	

	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/12.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/13.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/14.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/15.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


	////PÁGINA 9 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_ideal/16.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$ano_reduzido = substr($ano_emissao, 2, 4);
	
	$x = 129;
	$y = 209;
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+20, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+61, $y);
	$pdf->Cell(30, $altura, $ano_reduzido);

	$pdf->Output('bom_ideal'.$pedido.'.pdf', "I");
}else{
	exit;
}
?>