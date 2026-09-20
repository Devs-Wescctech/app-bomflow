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
	include("api_bompet_saude_3pets_recepcao/api_bom_pet_saude_titular.php");
	include("api_bompet_saude_3pets_recepcao/api_bom_pet_saude_dependentes.php");
	include("api_bompet_saude_3pets_recepcao/api_dados_cob_bom_pet_saude.php");

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
	$logo = 'contratos/bom_pet_saude_3pets/contrato_01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	if ($total_pets>=3){$adesao='60.00';}
	$x += 30;
	$y = 47;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $adesao, 0);//contorno

	if ($total_pets==1){
		$x = 53;
		$y = 44;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
		$x += 6;
		$y = 47;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $total_valor, 0);//contorno
	}
	if ($total_pets>1){	
		$x = 83;
		$y = 44;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
		$x += 6;
		$y = 47;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $total_valor, 0);//contorno
	}

	$y=0;
	$x=0;

	$x += 25;
	$y += 75;
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
	$y += 18;
	
	$anos=0;
	$meses=0;
	$idade=0;
	$dep_cor='';
	$cont_pets=1;

	for($i=0; $i<count($dependentes); $i++){

		if($cont_pets<=3){
			//echo "Pet: $i - cont_pets: $cont_pets - cont_paginas: $cont_paginas<br>";

			$x = 25;
			$dados_dep = $dependentes[$i];
			$dep_cor1 = $dados_dep[0];
			$dep_cor2 = $dados_dep[1];
			$dep_raca = $dados_dep[2];
			$dep_nome = $dados_dep[3];
			$dep_data_nasc = $dados_dep[4];
			$dep_sexo = $dados_dep[5];
			
			if($dep_data_nasc<>''){
				$idade_calcula = CalcularIdade($dep_data_nasc, 'amd', '-');	
				$tmp = explode('a', $idade_calcula);		
				$anos = $tmp[0];
				$meses = $tmp[1];
				$idade = $anos.' anos '.str_replace('m', ' meses', $meses);
			}
			if($dep_cor1<>''){
				$dep_cor = $dep_cor1;
			}
			if($dep_cor2<>''){
				if($dep_cor<>''){
					$dep_cor .=' e '.$dep_cor2;
				}else{
					$dep_cor = $dep_cor2;
				}
			}
			$altura_dependentes = 7.5;
			//IMPRESSÃO DOS DADOS DE CADA PET
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura_dependentes, utf8_decode($dep_nome), 0);//contorno
	
			if ($dep_sexo=='M'){
				$x = 154;
				$y = $y-1;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
			}
			if ($dep_sexo=='F'){
				$x = 158;
				$y = $y-1;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
			}
	
			//PET ID
			//$x = 166;
			//$pdf->SetXY($x, $y);
			//$pdf->Cell(35, $altura, 'PET ID número', 0);//contorno
			
			//RAÇA
			$x = 25;
			if ($i==2){$altura_dependentes = 10;}
			
			$y += 8;
			//Raça Animal 1
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(65, $altura_dependentes, utf8_decode($dep_raca), 0);//contorno
		
			$x += 70;
			//Cidade Titular
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(48, $altura_dependentes, $dep_cor, 0);//contorno
			
			$x = 148;
			//Cidade Titular
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, $idade, 0);//contorno
			
			if ($i==0){
				$y +=20;
			}else{
				$y +=11;	
			}
			$cont_pets++;
		}
		//echo "titular_sexo: $titular_sexo<br>";
	}//for
	
	//VALOR TAXA MENSAL *********************************************
	//*************************************************************
	$x = 160;
	$y = 216;
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
		//Adesão
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
		
	
	if ($total_pets>3){$adesao='60.00';
	//PÁGINA 4 - REPETIÇÃO 1 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x += 30;
	$y = 47;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $adesao, 0);//contorno

	if ($total_pets>1){	
		$x = 83;
		$y = 44;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
		$x += 6;
		$y = 47;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $total_valor, 0);//contorno
	}

	$y=0;
	$x=0;

	$x += 25;
	$y += 75;
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
	$y += 18;

	$anos=0;
	$meses=0;
	$idade=0;
	$dep_cor='';
	$y +=26;
	for($i=3; $i<=count($dependentes); $i++){
		$x = 25;
		if($i>=3 and $i<=4){		
			//echo "Pet: $i - cont_pets: $cont_pets - cont_paginas: $cont_paginas<br>";
			$altura_dependentes=10;
			$dados_dep = $dependentes[$i];
			$dep_cor1 = $dados_dep[0];
			$dep_cor2 = $dados_dep[1];
			$dep_raca = $dados_dep[2];
			$dep_nome = $dados_dep[3];
			$dep_data_nasc = $dados_dep[4];
			$dep_sexo = $dados_dep[5];
			if($dep_nome<>''){
				if($dep_data_nasc<>''){
					$idade_calcula = CalcularIdade($dep_data_nasc, 'amd', '-');	
					$tmp = explode('a', $idade_calcula);		
					$anos = $tmp[0];
					$meses = $tmp[1];
					$idade = $anos.' anos '.str_replace('m', ' meses', $meses);
				}
				if($dep_cor1<>''){
					$dep_cor = $dep_cor1;
				}
				if($dep_cor2<>''){
					if($dep_cor<>''){
						$dep_cor .=' e '.$dep_cor2;
					}else{
						$dep_cor = $dep_cor2;
					}
				}
				//IMPRESSÃO DOS DADOS DE CADA PET
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(118, $altura_dependentes, utf8_decode($dep_nome), 0);//contorno
		
				if ($dep_sexo=='M'){
					$x = 153;
					$y = $y-1;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
				}
				if ($dep_sexo=='F'){
					$x = 158;
					$y = $y-1;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
				}
		
				//PET ID
				//$x = 166;
				//$pdf->SetXY($x, $y);
				//$pdf->Cell(35, $altura, 'PET ID número', 0);//contorno
				
				//RAÇA
				$x = 25;
				
				$y += 9;
				//Raça Animal 1
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(65, $altura_dependentes, utf8_decode($dep_raca), 0);//contorno
			
				$x += 70;
				//Cidade Titular
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(48, $altura_dependentes, $dep_cor, 0);//contorno
				
				$x = 148;
				//Cidade Titular
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(28, $altura_dependentes, $idade, 0);//contorno
				
				$y +=9;
				//echo "titular_sexo: $titular_sexo<br>";
			}
		}
	}
		
		//VALOR TAXA MENSAL *********************************************
		//*************************************************************
		$x = 160;
		$y = 216;
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
			//Adesão
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
	}
	
	if ($total_pets>5){$adesao='60.00';
	//PÁGINA 4 - IMPRIME CONFORME O NÚMERO DE PETS EXTRA ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x += 30;
	$y = 47;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $adesao, 0);//contorno

	if ($total_pets>1){	
		$x = 83;
		$y = 44;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
		$x += 6;
		$y = 47;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $total_valor, 0);//contorno
	}

	$y=0;
	$x=0;

	$x += 25;
	$y += 75;
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
	$y += 18;
	
	$anos=0;
	$meses=0;
	$idade=0;
	$dep_cor='';
	$y +=26;
	for($i=5; $i<count($dependentes); $i++){
		$x = 25;
		if($i>=5 and $i<=6){
			//echo "Pet: $i - cont_pets: $cont_pets - cont_paginas: $cont_paginas<br>";
			$altura_dependentes=10;
			$dados_dep = $dependentes[$i];
			$dep_cor1 = $dados_dep[0];
			$dep_cor2 = $dados_dep[1];
			$dep_raca = $dados_dep[2];
			$dep_nome = $dados_dep[3];
			$dep_data_nasc = $dados_dep[4];
			$dep_sexo = $dados_dep[5];
			
			if($dep_data_nasc<>''){
				$idade_calcula = CalcularIdade($dep_data_nasc, 'amd', '-');	
				$tmp = explode('a', $idade_calcula);		
				$anos = $tmp[0];
				$meses = $tmp[1];
				$idade = $anos.' anos '.str_replace('m', ' meses', $meses);
			}
			if($dep_cor1<>''){
				$dep_cor = $dep_cor1;
			}
			if($dep_cor2<>''){
				if($dep_cor<>''){
					$dep_cor .=' e '.$dep_cor2;
				}else{
					$dep_cor = $dep_cor2;
				}
			}
			//IMPRESSÃO DOS DADOS DE CADA PET
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura_dependentes, utf8_decode($dep_nome), 0);//contorno
	
			if ($dep_sexo=='M'){
				$x = 153;
				$y = $y-1;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
			}
			if ($dep_sexo=='F'){
				$x = 158;
				$y = $y-1;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
			}
	
			//PET ID
			//$x = 166;
			//$pdf->SetXY($x, $y);
			//$pdf->Cell(35, $altura, 'PET ID número', 0);//contorno
			
			//RAÇA
			$x = 25;
			
			$y += 9;
			//Raça Animal 1
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(65, $altura_dependentes, utf8_decode($dep_raca), 0);//contorno
		
			$x += 70;
			//Cidade Titular
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(48, $altura_dependentes, $dep_cor, 0);//contorno
			
			$x = 148;
			//Cidade Titular
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, $idade, 0);//contorno
			
			$y +=9;
			//echo "titular_sexo: $titular_sexo<br>";
		}
	}//for
	
		//VALOR TAXA MENSAL *********************************************
		//*************************************************************
		$x = 160;
		$y = 216;
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
			//Adesão
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
	}

	if ($total_pets>7){$adesao='60.00';
	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x += 30;
	$y = 47;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $adesao, 0);//contorno

	if ($total_pets>1){	
		$x = 83;
		$y = 44;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
		$x += 6;
		$y = 47;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $total_valor, 0);//contorno
	}

	$y=0;
	$x=0;

	$x += 25;
	$y += 75;
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
	$y += 18;
	
	$anos=0;
	$meses=0;
	$idade=0;
	$dep_cor='';
	$y +=26;
	for($i=7; $i<count($dependentes); $i++){
		$x = 25;
		if($i>=7 and $i<=8){
			//echo "Pet: $i - cont_pets: $cont_pets - cont_paginas: $cont_paginas<br>";
			$altura_dependentes=10;
			$dados_dep = $dependentes[$i];
			$dep_cor1 = $dados_dep[0];
			$dep_cor2 = $dados_dep[1];
			$dep_raca = $dados_dep[2];
			$dep_nome = $dados_dep[3];
			$dep_data_nasc = $dados_dep[4];
			$dep_sexo = $dados_dep[5];
			
			if($dep_data_nasc<>''){
				$idade_calcula = CalcularIdade($dep_data_nasc, 'amd', '-');	
				$tmp = explode('a', $idade_calcula);		
				$anos = $tmp[0];
				$meses = $tmp[1];
				$idade = $anos.' anos '.str_replace('m', ' meses', $meses);
			}
			if($dep_cor1<>''){
				$dep_cor = $dep_cor1;
			}
			if($dep_cor2<>''){
				if($dep_cor<>''){
					$dep_cor .=' e '.$dep_cor2;
				}else{
					$dep_cor = $dep_cor2;
				}
			}
			//IMPRESSÃO DOS DADOS DE CADA PET
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura_dependentes, utf8_decode($dep_nome), 0);//contorno
	
			if ($dep_sexo=='M'){
				$x = 153;
				$y = $y-1;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
			}
			if ($dep_sexo=='F'){
				$x = 158;
				$y = $y-1;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
			}
	
			//PET ID
			//$x = 166;
			//$pdf->SetXY($x, $y);
			//$pdf->Cell(35, $altura, 'PET ID número', 0);//contorno
			
			//RAÇA
			$x = 25;
			
			$y += 9;
			//Raça Animal 1
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(65, $altura_dependentes, utf8_decode($dep_raca), 0);//contorno
		
			$x += 70;
			//Cidade Titular
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(48, $altura_dependentes, $dep_cor, 0);//contorno
			
			$x = 148;
			//Cidade Titular
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, $idade, 0);//contorno
			
			$y +=9;
			//echo "titular_sexo: $titular_sexo<br>";
		}
	}
		//VALOR TAXA MENSAL *********************************************
		//*************************************************************
		$x = 160;
		$y = 216;
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
			//Adesão
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
	}

if ($total_pets>9){$adesao='60.00';
	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x += 30;
	$y = 47;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $adesao, 0);//contorno

	if ($total_pets>1){	
		$x = 83;
		$y = 44;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
		$x += 6;
		$y = 47;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $total_valor, 0);//contorno
	}

	$y=0;
	$x=0;

	$x += 25;
	$y += 75;
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
	$y += 18;
	
	$anos=0;
	$meses=0;
	$idade=0;
	$dep_cor='';
	$y +=26;
	for($i=9; $i<count($dependentes); $i++){
		$x = 25;
		if($i>=9 and $i<=10){
			//echo "Pet: $i - cont_pets: $cont_pets - cont_paginas: $cont_paginas<br>";
			$altura_dependentes=10;
			$dados_dep = $dependentes[$i];
			$dep_cor1 = $dados_dep[0];
			$dep_cor2 = $dados_dep[1];
			$dep_raca = $dados_dep[2];
			$dep_nome = $dados_dep[3];
			$dep_data_nasc = $dados_dep[4];
			$dep_sexo = $dados_dep[5];
			
			if($dep_data_nasc<>''){
				$idade_calcula = CalcularIdade($dep_data_nasc, 'amd', '-');	
				$tmp = explode('a', $idade_calcula);		
				$anos = $tmp[0];
				$meses = $tmp[1];
				$idade = $anos.' anos '.str_replace('m', ' meses', $meses);
			}
			if($dep_cor1<>''){
				$dep_cor = $dep_cor1;
			}
			if($dep_cor2<>''){
				if($dep_cor<>''){
					$dep_cor .=' e '.$dep_cor2;
				}else{
					$dep_cor = $dep_cor2;
				}
			}
			//IMPRESSÃO DOS DADOS DE CADA PET
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura_dependentes, utf8_decode($dep_nome), 0);//contorno
	
			if ($dep_sexo=='M'){
				$x = 153;
				$y = $y-1;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
			}
			if ($dep_sexo=='F'){
				$x = 158;
				$y = $y-1;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
			}
	
			//PET ID
			//$x = 166;
			//$pdf->SetXY($x, $y);
			//$pdf->Cell(35, $altura, 'PET ID número', 0);//contorno
			
			//RAÇA
			$x = 25;
			
			$y += 9;
			//Raça Animal 1
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(65, $altura_dependentes, utf8_decode($dep_raca), 0);//contorno
		
			$x += 70;
			//Cidade Titular
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(48, $altura_dependentes, $dep_cor, 0);//contorno
			
			$x = 148;
			//Cidade Titular
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, $idade, 0);//contorno
			
			$y +=9;
			//echo "titular_sexo: $titular_sexo<br>";
		}
	}
		//VALOR TAXA MENSAL *********************************************
		//*************************************************************
		$x = 160;
		$y = 216;
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
			//Adesão
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
	}

//****************** MAIOR QUE 10 PETS *****	
if ($total_pets>10){$adesao='60.00';
	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x += 30;
	$y = 47;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $adesao, 0);//contorno

	if ($total_pets>1){	
		$x = 83;
		$y = 44;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
		$x += 6;
		$y = 47;
		//Adesão
		$pdf->SetFont('times', '', 11);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $total_valor, 0);//contorno
	}

	$y=0;
	$x=0;

	$x += 25;
	$y += 75;
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
	$y += 18;
	
	$anos=0;
	$meses=0;
	$idade=0;
	$dep_cor='';
	$y +=26;
	for($i=11; $i<count($dependentes); $i++){
		$x = 25;
		if($i>=11 and $i<=12){
			//echo "Pet: $i - cont_pets: $cont_pets - cont_paginas: $cont_paginas<br>";
			$altura_dependentes=10;
			$dados_dep = $dependentes[$i];
			$dep_cor1 = $dados_dep[0];
			$dep_cor2 = $dados_dep[1];
			$dep_raca = $dados_dep[2];
			$dep_nome = $dados_dep[3];
			$dep_data_nasc = $dados_dep[4];
			$dep_sexo = $dados_dep[5];
			
			if($dep_data_nasc<>''){
				$idade_calcula = CalcularIdade($dep_data_nasc, 'amd', '-');	
				$tmp = explode('a', $idade_calcula);		
				$anos = $tmp[0];
				$meses = $tmp[1];
				$idade = $anos.' anos '.str_replace('m', ' meses', $meses);
			}
			if($dep_cor1<>''){
				$dep_cor = $dep_cor1;
			}
			if($dep_cor2<>''){
				if($dep_cor<>''){
					$dep_cor .=' e '.$dep_cor2;
				}else{
					$dep_cor = $dep_cor2;
				}
			}
			//IMPRESSÃO DOS DADOS DE CADA PET
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura_dependentes, utf8_decode($dep_nome), 0);//contorno
	
			if ($dep_sexo=='M'){
				$x = 153;
				$y = $y-1;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
			}
			if ($dep_sexo=='F'){
				$x = 158;
				$y = $y-1;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura_dependentes, 'X', 0);//contorno
			}
	
			//PET ID
			//$x = 166;
			//$pdf->SetXY($x, $y);
			//$pdf->Cell(35, $altura, 'PET ID número', 0);//contorno
			
			//RAÇA
			$x = 25;
			
			$y += 9;
			//Raça Animal 1
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(65, $altura_dependentes, utf8_decode($dep_raca), 0);//contorno
		
			$x += 70;
			//Cidade Titular
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(48, $altura_dependentes, $dep_cor, 0);//contorno
			
			$x = 148;
			//Cidade Titular
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(28, $altura_dependentes, $idade, 0);//contorno
			
			$y +=9;
			//echo "titular_sexo: $titular_sexo<br>";
		}
	}
		//VALOR TAXA MENSAL *********************************************
		//*************************************************************
		$x = 160;
		$y = 216;
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
			//Adesão
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
	}
//*****FINAL MAIOR QUE 10 PETS***
	
	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 6 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	///PÁGINA 07 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_07.jpg';//cria nome da imagem de cabecalho
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
	$logo = 'contratos/bom_pet_saude_3pets/contrato_08.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	///PÁGINA 09 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_09.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	///PÁGINA 10 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_pet_saude_3pets/contrato_10.jpg';//cria nome da imagem de cabecalho
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