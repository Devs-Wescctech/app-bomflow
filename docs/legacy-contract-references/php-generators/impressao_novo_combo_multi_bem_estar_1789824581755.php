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

	include("api_combo_bem_estar_especial_recepcao/api_combo_especial_multi_bem_estar_pesquisa_titular.php");
	include("api_combo_bem_estar_especial_recepcao/api_combo_especial_multi_bem_estar_titular.php");
	include("api_combo_bem_estar_especial_recepcao/api_combo_especial_multi_bem_estar_cob.php");
	include("api_combo_bem_estar_especial_recepcao/api_combo_especial_bom_pet_dependentes.php");
	include("api_combo_bem_estar_especial_recepcao/api_combo_especial_bom_med_dependentes.php");
	include("api_combo_bem_estar_especial_recepcao/api_combo_especial_bom_auto_dados_carros.php");
	include("api_combo_bem_estar_especial_recepcao/api_combo_especial_multi_bem_estar_coroa.php");
	include("api_combo_bem_estar_especial_recepcao/api_combo_especial_multi_bem_estar_cremacao.php");	
	include("api_combo_bem_estar_especial_recepcao/api_combo_especial_multi_bem_estar_descanso_quilometragem.php");	
	

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
	$logo = 'contratos/combo_bem_estar_especial/contrato_01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x = 29;
	$y = 39;	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($cob_adesao), 0);//contorno
	
	/*if ($total_dep>1){
		$cob_total_valor=$cob_total_valor-$total_dep;	
	}
	*/
	$x = 52;
	//Plano Padrão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($cob_total_valor), 0);//contorno

	$x = 75;
	//Dependente(adicional)
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($tot_dependentes_cob), 0);//contorno
	
	$mensalidade_total=0;
	$mensalidade_total = $cob_total_valor + $tot_dependentes_cob;
	if ($total_valor_coroa>0){
		$mensalidade_total = $mensalidade_total + $total_valor_coroa;
	}
	if ($total_valor_cremacao<>''){
		$mensalidade_total = $mensalidade_total + $total_valor_cremacao;
	}
	if ($total_valor_quilometragem<>''){
		$mensalidade_total = $mensalidade_total + $total_valor_quilometragem;
	}
	
	$x = 100;
	//Mensalidade total
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($mensalidade_total), 0);//contorno

	

///*******************VENCIMENTO
	$y += 8;
	
	//Vencimento
	if ($vencimento=='10'){
		$x = 24.5;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='15'){
		$x = 47.5;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='20'){
		$x = 71;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='25'){
		$x = 94;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	$x = 24;
	$y = 56;
	//Cliente
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno

	//Sexo
	if ($sexo=='MASCULINO'){
		$x = 153;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($sexo=='FEMININO'){
		$x = 157;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	//Est. Civil
	if ($estado_civil=='SOLTEIRO'){
		$x = 163;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if($estado_civil=='CASADO'){
		$x = 168;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if($estado_civil=='OUTROS'){
		$x = 173;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Data de nascimento
	if ($data_nascimento<>''){
		$data_nasc = explode('-',$data_nascimento);
		$temp = $data_nasc[2].'     '.$data_nasc[1].'     '.$data_nasc[0];
	
		$x = 180;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $temp, 0);//contorno
	}
	$y += 6.5;
	$x = 24;
	//CPF Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $documento, 0);//contorno

	$x += 92;
	//RG Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $rg, 0);//contorno

	$y += 7;
	$x = 24;
	if ($complemento<>''){
		$uniao_endereco = $endereco.' - '.$complemento; 
	}else{
		$uniao_endereco = $endereco; 
	}
	//Endereço Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(157, $altura, utf8_decode($uniao_endereco), 0);//contorno

	$x = 188;
	//Número endereço Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(18, $altura, $numero, 0);//contorno

	$y += 6;
	$x = 24;
	//Bairro Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(78, $altura, utf8_decode($bairro), 0);//contorno

	$x += 83;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(93, $altura, $cidade, 0);//contorno

	$y += 7;
	$x = 24;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $sigla, 0);//contorno

	//CEP
	//$codigo_postal= $titular_cep;

	$postal1=$codigo_postal[0];
	$postal2=$codigo_postal[1];
	$postal3=$codigo_postal[2];
	$postal4=$codigo_postal[3];
	$postal5=$codigo_postal[4];
	$postal6=$codigo_postal[6];
	$postal7=$codigo_postal[7];
	$postal8=$codigo_postal[8];
	$x +=11.5;
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
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(52, $altura, $telefone1, 0);//contorno

	$x += 57;
	//cep Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(67, $altura, $telefone2, 0);//contorno

//**** NOVA LINHA
	$y += 6.5;
	$x = 24;
	//Bairro Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $profissao, 0);//contorno

	$x = 70;
	//Bairro Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $renda, 0);//contorno

	$x = 107;
	//Cidade Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(95, $altura, $email, 0);//contorno
	


	/////***** BOM AUTO ***
		//DADOS DO VEICULO 1 *********************************************
		//*************************************************************
		//Adesão

		$x = 25;
		$y =104;
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(90, $altura, $veiculo, 0);//contorno
		
		//PET ID
		$x += 90;
		$pdf->SetXY($x, $y);
		$pdf->Cell(90, $altura, $modelo, 0);//contorno
	
		//CARRO
		$x = 25;
		$y += 6;
		//Cor Carro 1
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(65, $altura, $cor_carro, 0);//contorno
	
		$x += 69;
		//Ano Carro 1
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(48, $altura, $ano_fabricacao, 0);//contorno
		
		$x += 42;
		//Cidade Titular
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(40, $altura, strtoupper($placa), 0);//contorno
	
	if($veiculo<>''){
		//DADOS DEPENDENTE 1 *********************************************
		//*************************************************************
		$x = 24;
		$y += 7.5;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno
	
		//Sexo
		if ($sexo=='MASCULINO'){
			$x = 152;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if ($sexo=='FEMININO'){
			$x = 157;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if($estado_civil=='SOLTEIRO'){
			$x = 163;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if($estado_civil=='CASADO'){
			$x = 168;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if($estado_civil=='OUTROS'){
			$x = 173;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		//Data de nascimento
		if ($data_nascimento<>''){
			$data_nasc = explode('-',$data_nascimento);
			$temp = $data_nasc[2].'    '.$data_nasc[1].'   '.$data_nasc[0];
		
			$x = 181;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, $temp, 0);//contorno
		}
		$y += 6;
		$x = 24;
		//CPF Titular
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $cpf, 0);//contorno
	
		$x = 115;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $telefone1, 0);//contorno
	}
if($cont_bom_pet>0){
	//PERCORRE DEPENDENTES PETS *********************************************
	//*************************************************************
	$x = 24;
	$y = 138;
	$altura_dependentes = 7.5;

		//IMPRESSÃO DOS DADOS DE CADA PET
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura_dependentes, utf8_decode($nome_pet), 0);//contorno

		if ($sexo_pet=='M'){
			$x = 158;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
		}
		if ($sexo_pet=='F'){
			$x = 163;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
		}
		$altura_dependentes = 7.5;
		$x = 24;
		$y = 145;
		if ($raca<>''){
			//Raça Animal 1
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(65, $altura_dependentes, utf8_decode($raca), 0);//contorno
		}
	
		$x += 83;
		//Cidade Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(48, $altura_dependentes, $cor1, 0);//contorno
		
		$x = 154;
		if ($data_nasc_pet<>''){	
			$idade_calcula = CalcularIdade($data_nasc_pet, 'amd', '-');	
			$tmp = explode('a', $idade_calcula);		
			$anos = $tmp[0];
			$meses = $tmp[1];
			$idade = $anos.' anos '.str_replace('m', ' meses', $meses);
	
			//Cidade Titular
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, $idade, 0);//contorno
		}

		$y = 156;
		if ($porte=='PEQUENO'){
			$x = 190;
			//Cidade Titular
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, 'X', 0);//contorno
		}
		if ($porte=='MEDIO'){
			$x = 194;
			//Cidade Titular
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, 'X', 0);//contorno
		}
		if ($porte=='GRANDE'){
			$x = 199;
			//Cidade Titular
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, 'X', 0);//contorno
		}
}
if($bom_med==1){		
//////////************* BOM MED ********************
	$y = 169;
	$x = 30;
	$entrou=0;
	
	for($i=0; $i<count($dependentes); $i++){
		$dados_dependentes = $dependentes[$i];
		$dep_preco = $dados_dependentes[0];
		$dep_celular = $dados_dependentes[1];
		$dep_data_nascimento = $dados_dependentes[2];
		$dep_nome_pessoa = $dados_dependentes[3];
		$dep_cpf = $dados_dependentes[4];
		$dep_sexo = $dados_dependentes[6];
		$pdf->SetFont('times', '', 9);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno
		
		//////cpf
		$x = 115;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $dep_cpf, 0);//contorno

		//Sexo
		$x = 140;
		if ($dep_sexo=='F'){
			$y=$y-1;
			$pdf->SetFont('times', '', 10);			
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'x', 0);//contorno
		}
		$x = 146;
		if ($dep_sexo=='M'){
			$y=$y-1;			
			$pdf->SetFont('times', '', 10);			
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'x', 0);//contorno
		}
									
		//Data de nascimento
		if ($dep_data_nascimento<>''){
			$data_nasc = explode('-',$dep_data_nascimento);
			$temp = $data_nasc[2].'      '.$data_nasc[1].'   '.$data_nasc[0];
				
			$y = $y+1;				
			$x = 150;
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, $temp, 0);//contorno
		}
		$x = 172;
		$pdf->SetFont('times', '', 9);			
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $dep_celular, 0);//contorno

		if($dep_preco>1){
			$x = 194;
			$pdf->SetFont('times', '', 9);			
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, $dep_preco, 0);//contorno
		}
		
		if($i<2 or $entrou==1){
			$y +=4;
		}else{
			$y +=9;
			$entrou=1;	
		}
		$x=30;
	}
	$x = 180;
	$y = 228;
	//Dependente(adicional)
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($total_dep), 0);//contorno
}

//OBSERVAÇÃO
//*************************************
//*******DATA **********
	$y = 238;
	$x = 32;
	//Data
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(8, $altura, $dia_emissao);
	$pdf->SetXY($x+13, $y);
	$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+35, $y);
	$pdf->Cell(8, $altura, $ano_emissao);

	
	//****TIPO DE COBRANÇA**********
	if ($plano_pagamento==25451 or $plano_pagamento==48296791 or $plano_pagamento==40564923 or $plano_pagamento==48286734 or $plano_pagamento==1643483 or $plano_pagamento==48295856 or $plano_pagamento==82623870){
		//Tipo de cobrança
		$x = 165;
		$y +=1;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($plano_pagamento==46285 or $plano_pagamento==47214448 or $plano_pagamento==48395023 or $plano_pagamento==88733784){
		//Tipo de Cobrança
		$x = 185;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_bem_estar_especial/contrato_02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_bem_estar_especial/contrato_03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_bem_estar_especial/contrato_04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 6 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_bem_estar_especial/contrato_05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 7 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_bem_estar_especial/contrato_06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 7 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_bem_estar_especial/contrato_07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 7 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_bem_estar_especial/contrato_08.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


	$x = 132;
	$y = 217;
	$ano_reduzido = substr($ano_emissao, 2, 4);
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+18, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+59, $y);
	$pdf->Cell(30, $altura, $ano_reduzido);
	
	
	//PÁGINA 7 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_multi_bem_estar/protocolo_01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


	$x = 29;
	$y = 39;	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($cob_adesao), 0);//contorno
	
	/*if ($total_dep>1){
		$cob_total_valor=$cob_total_valor-$total_dep;	
	}
	*/
	$x = 52;
	//Plano Padrão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($cob_total_valor), 0);//contorno

	$x = 75;
	//Dependente(adicional)
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($tot_dependentes_cob), 0);//contorno
	
	$mensalidade_total=0;
	$mensalidade_total = $cob_total_valor + $tot_dependentes_cob;
	if ($total_valor_coroa>0){
		$mensalidade_total += $total_valor_coroa;
	}
	if ($total_valor_cremacao<>''){
		$mensalidade_total += $total_valor_cremacao;
	}
	if ($total_valor_quilometragem<>''){
		$mensalidade_total += $total_valor_quilometragem;
	}
	
	$x = 100;
	//Mensalidade total
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($mensalidade_total), 0);//contorno


	

///*******************VENCIMENTO
	$y += 8.5;
	
	//Vencimento
	if ($vencimento=='10'){
		$x = 24.5;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='15'){
		$x = 47.5;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='20'){
		$x = 71;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='25'){
		$x = 94;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	$x = 24;
	$y = 56.5;	
	//Cliente
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno

	//Sexo
	if ($sexo=='MASCULINO'){
		$x = 153;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($sexo=='FEMININO'){
		$x = 157;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	//Est. Civil
	if ($estado_civil=='SOLTEIRO'){
		$x = 163;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if($estado_civil=='CASADO'){
		$x = 168;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if($estado_civil=='OUTROS'){
		$x = 173;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Data de nascimento
	if ($data_nascimento<>''){
		$data_nasc = explode('-',$data_nascimento);
		$temp = $data_nasc[2].'     '.$data_nasc[1].'     '.$data_nasc[0];
	
		$x = 180;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $temp, 0);//contorno
	}
	$y += 6.5;
	$x = 24;
	//CPF Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $documento, 0);//contorno

	$x += 92;
	//RG Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $rg, 0);//contorno

	$y += 6.5;
	$x = 24;
	if ($complemento<>''){
		$uniao_endereco = $endereco.' - '.$complemento; 
	}else{
		$uniao_endereco = $endereco; 
	}
	//Endereço Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(157, $altura, utf8_decode($uniao_endereco), 0);//contorno

	$x = 188;
	//Número endereço Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(18, $altura, $numero, 0);//contorno

	$y += 6;
	$x = 24;
	//Bairro Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(78, $altura, utf8_decode($bairro), 0);//contorno

	$x += 83;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(93, $altura, $cidade, 0);//contorno

	$y += 7;
	$x = 24;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 10);
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
	
	$x +=12;
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
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(52, $altura, $telefone1, 0);//contorno

	$x += 57;
	//cep Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(67, $altura, $telefone2, 0);//contorno

//**** NOVA LINHA
	$y += 6.5;
	$x = 24;
	//Bairro Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $profissao, 0);//contorno

	$x = 70;
	//Bairro Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $renda, 0);//contorno

	$x = 107;
	//Cidade Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(95, $altura, $email, 0);//contorno
	


	/////***** BOM AUTO ***
		//DADOS DO VEICULO 1 *********************************************
		//*************************************************************
		//Adesão

		$x = 25;
		$y =104.5;
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(90, $altura, $veiculo, 0);//contorno
		
		//PET ID
		$x += 90;
		$pdf->SetXY($x, $y);
		$pdf->Cell(90, $altura, $modelo, 0);//contorno
	
		//CARRO
		$x = 25;
		$y += 6;
		//Cor Carro 1
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(65, $altura, $cor_carro, 0);//contorno
	
		$x += 67;
		//Ano Carro 1
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(48, $altura, $ano_fabricacao, 0);//contorno
		
		$x += 40;
		//Cidade Titular
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(40, $altura, strtoupper($placa), 0);//contorno
	
	if($veiculo<>''){
		//DADOS DEPENDENTE 1 *********************************************
		//*************************************************************
		$x = 24;
		$y += 7;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno
	
		//Sexo
		if ($sexo=='MASCULINO'){
			$x = 152;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if ($sexo=='FEMININO'){
			$x = 157;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if($estado_civil=='SOLTEIRO'){
			$x = 163;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if($estado_civil=='CASADO'){
			$x = 168;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		if($estado_civil=='OUTROS'){
			$x = 173;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'X', 0);//contorno
		}
		//Data de nascimento
		if ($data_nascimento<>''){
			$data_nasc = explode('-',$data_nascimento);
			$temp = $data_nasc[2].'    '.$data_nasc[1].'   '.$data_nasc[0];
		
			$x = 181;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, $temp, 0);//contorno
		}
		$y += 6;
		$x = 24;
		//CPF Titular
		$pdf->SetFont('times', '', 10);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $cpf, 0);//contorno
	
		$x = 115;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $telefone1, 0);//contorno
	}
if($cont_bom_pet>0){
	//PERCORRE DEPENDENTES PETS *********************************************
	//*************************************************************
	$x = 24;
	$y = 137.5;
	$altura_dependentes = 7.5;

		//IMPRESSÃO DOS DADOS DE CADA PET
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura_dependentes, utf8_decode($nome_pet), 0);//contorno

		if ($sexo_pet=='M'){
			$x = 158;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
		}
		if ($sexo_pet=='F'){
			$x = 163;
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
		}
		$altura_dependentes = 7.5;
		$x = 24;
		$y = 144;
		if ($raca<>''){
			//Raça Animal 1
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(65, $altura_dependentes, utf8_decode($raca), 0);//contorno
		}
	
		$x += 83;
		//Cidade Titular
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(48, $altura_dependentes, $cor1, 0);//contorno
		
		$x = 154;
		if ($data_nasc_pet<>''){	
			$idade_calcula = CalcularIdade($data_nasc_pet, 'amd', '-');	
			$tmp = explode('a', $idade_calcula);		
			$anos = $tmp[0];
			$meses = $tmp[1];
			$idade = $anos.' anos '.str_replace('m', ' meses', $meses);
	
			//Cidade Titular
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, $idade, 0);//contorno
		}

		$y = 142;
		if ($porte=='PEQUENO'){
			$x = 190;
			//Cidade Titular
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, 'X', 0);//contorno
		}
		if ($porte=='MEDIO'){
			$x = 194;
			//Cidade Titular
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, 'X', 0);//contorno
		}
		if ($porte=='GRANDE'){
			$x = 199;
			//Cidade Titular
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, 'X', 0);//contorno
		}
}
if($bom_med==1){		
//////////************* BOM MED ********************
	$y = 169;
	$x = 30;
	$entrou=0;
	
	for($i=0; $i<count($dependentes); $i++){
		$dados_dependentes = $dependentes[$i];
		$dep_preco = $dados_dependentes[0];
		$dep_celular = $dados_dependentes[1];
		$dep_data_nascimento = $dados_dependentes[2];
		$dep_nome_pessoa = $dados_dependentes[3];
		$dep_cpf = $dados_dependentes[4];
		$dep_sexo = $dados_dependentes[6];
		$pdf->SetFont('times', '', 9);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno
		
		//////cpf
		$x = 115;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $dep_cpf, 0);//contorno

		//Sexo
		$x = 140;
		if ($dep_sexo=='F'){
			$y=$y-1;
			$pdf->SetFont('times', '', 10);			
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'x', 0);//contorno
		}
		$x = 146;
		if ($dep_sexo=='M'){
			$y=$y-1;			
			$pdf->SetFont('times', '', 10);			
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, 'x', 0);//contorno
		}
									
		//Data de nascimento
		if ($dep_data_nascimento<>''){
			$data_nasc = explode('-',$dep_data_nascimento);
			$temp = $data_nasc[2].'      '.$data_nasc[1].'   '.$data_nasc[0];
				
			$y = $y+1;				
			$x = 150;
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, $temp, 0);//contorno
		}
		$x = 172;
		$pdf->SetFont('times', '', 9);			
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $dep_celular, 0);//contorno

		if($dep_preco>1){
			$x = 194;
			$pdf->SetFont('times', '', 9);			
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, $dep_preco, 0);//contorno
		}
		
		if($i<2 or $entrou==1){
			$y +=4;
		}else{
			$y +=9;
			$entrou=1;	
		}
		$x=30;
	}
	$x = 180;
	$y = 228;
	//Dependente(adicional)
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($total_dep), 0);//contorno
}

//OBSERVAÇÃO
//*************************************
//*******DATA **********
	$y = 238;
	$x = 32;
	//Data
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(8, $altura, $dia_emissao);
	$pdf->SetXY($x+13, $y);
	$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+35, $y);
	$pdf->Cell(8, $altura, $ano_emissao);

	
	//****TIPO DE COBRANÇA**********
	if ($plano_pagamento==25451 or $plano_pagamento==48296791 or $plano_pagamento==40564923 or $plano_pagamento==48286734 or $plano_pagamento==1643483 or $plano_pagamento==48295856 or $plano_pagamento==82623870){
		//Tipo de cobrança
		$x = 165;
		$y +=1;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($plano_pagamento==46285 or $plano_pagamento==47214448 or $plano_pagamento==48395023 or $plano_pagamento==88733784){
		//Tipo de Cobrança
		$x = 185;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	//ADENDO AO NOVO CONTRATO ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_multi_bem_estar/protocolo_02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//ADENDO AO NOVO CONTRATO ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_multi_bem_estar/protocolo_03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//ADENDO AO NOVO CONTRATO ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_multi_bem_estar/protocolo_04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//ADENDO AO NOVO CONTRATO ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_multi_bem_estar/protocolo_05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	//ADENDO AO NOVO CONTRATO ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_multi_bem_estar/protocolo_06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//ADENDO AO NOVO CONTRATO ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_multi_bem_estar/protocolo_07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//ADENDO AO NOVO CONTRATO ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/combo_multi_bem_estar/protocolo_08.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	

	$x = 132;
	$y = 210;
	$ano_reduzido = substr($ano_emissao, 2, 4);
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+18, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+59, $y);
	$pdf->Cell(30, $altura, $ano_reduzido);

	if($cont_bom_pet>0){
		//PÁGINA 7 ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/combo_multi_bem_estar/adendo_tele_medicina.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
		
		$x = 122;
		$y = 244;
		$ano_reduzido = substr($ano_emissao, 2, 4);
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+19, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+60, $y);
		$pdf->Cell(30, $altura, $ano_reduzido);
		
	}

	if($total_valor_cremacao>0){	
		//PÁGINA ADENDO CREMAÇÃO####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/combo_bem_estar_especial/cremacao.jpg';//cria nome da imagem de cabecalho
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
		$logo = 'contratos/combo_bem_estar_especial/tanatopraxia.jpg';//cria nome da imagem de cabecalho
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
		$logo = 'contratos/combo_bem_estar_especial/quilometragem.jpg';//cria nome da imagem de cabecalho
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
	if ($total_valor_coroa>0){
		//PÁGINA 01 COROA DE FLORES ####################
		$pdf->AddPage();
		$linhas = 1;
		$x = 0;
		$y = 0;
		$logo = 'contratos/combo_bem_estar_especial/01_coroa.jpg';//cria nome da imagem de cabecalho
		$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
		
		$x = 25;
		$y = 90;
		//Cliente
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($quant_coroa), 0);//contorno

		$x = 148;
		$y = 119;
		//Cliente
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, Formata_valor($total_valor_coroa), 0);//contorno
		
		$valor_extenso = func_escreve_numero_extenso($total_valor_coroa, 0, 0);
		$valor_extenso=$valor_extenso.' Reais';
		$x = 25;
		$y = 123;
		//Cliente
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, utf8_decode($valor_extenso), 0);//contorno
		
		$ano_reduzido = substr($ano_emissao, 2, 4);
		
		$x = 124;
		$y = 239;
		$pdf->SetFont('times', '', 12);
		$pdf->SetXY($x, $y);
		$pdf->Cell(30, $altura, $dia_emissao);
		$pdf->SetXY($x+20, $y);
		$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
		$pdf->SetXY($x+58, $y);
		$pdf->Cell(30, $altura, $ano_reduzido);
	}

	$pdf->Output('combo_bem_estar_especial'.$pedido.'.pdf', "I");
}else{
	exit;
}

?>