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

	include("api_bommed_recepcao/api_bom_med_pesquisa_titular.php");
	include("api_bommed_recepcao/api_bom_med_titular.php");
	include("api_bommed_recepcao/api_bom_med_dependentes.php");
	include("api_bommed_recepcao/api_dados_cob_bom_med.php");

	if($data_emissao<>''){
		$dia_emissao = Pega_dia($data_emissao);
		$mes_emissao = Pega_mes($data_emissao);
		$ano_emissao = Pega_ano($data_emissao);
		$mes_emissao = Retorna_mes($mes_emissao);//descrição
	}else{
		$dia_emissao = date("d");
		$mes_emissao = date("m");
		$ano_emissao = date("Y");
		$mes_emissao = Retorna_mes($mes_emissao);//descrição
	}
	
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
	$logo = 'contratos/bom_med/01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");


	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_med/02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x = 20;
	$y += 50.5;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($cob_adesao), 0);//contorno
	
	if ($total_dep>1){
		$cob_total_valor=$cob_total_valor-$total_dep;	
	}
	$x = 48;
	//Plano Padrão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($cob_total_valor), 0);//contorno

	$x = 73;
	//Dependente(adicional)
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($total_dep), 0);//contorno
	
	$mensalidade_total=0;
	$mensalidade_total = $cob_total_valor + $total_dep;
	$x = 98;
	//Mensalidade total
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($mensalidade_total), 0);//contorno

	

///*******************VENCIMENTO
	$y += 9.5;
	
	//Vencimento
	if ($vencimento=='10'){
		$x = 16;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='15'){
		$x = 42;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='20'){
		$x = 68.5;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='25'){
		$x = 95;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	$x = 16;
	$y += 12;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $cliente, 0);//contorno

	//Sexo
	if ($sexo=='MASCULINO'){
		$x = 138;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if ($sexo=='FEMININO'){
		$x = 143;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}

	//Est. Civil
	if ($estado_civil=='SOLTEIRO'){
		$x = 151;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if($estado_civil=='CASADO'){
		$x = 155;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	if($estado_civil=='OUTROS'){
		$x = 161;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Data de nascimento
	if ($data_nascimento<>''){
		$data_nasc = explode('-',$data_nascimento);
		$temp = $data_nasc[2].'     '.$data_nasc[1].'    '.$data_nasc[0];
	
		$x = 170;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $temp, 0);//contorno
	}
	$y += 8;
	$x = 16;
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
	$x = 16;
	if ($complemento<>''){
		$uniao_endereco = $endereco.' - '.$complemento; 
	}else{
		$uniao_endereco = $endereco; 
	}
	//Endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(157, $altura, utf8_decode($uniao_endereco), 0);//contorno

	$x = 178;
	//Número endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(18, $altura, $numero, 0);//contorno

	$y += 7.5;
	$x = 16;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(78, $altura, utf8_decode($bairro), 0);//contorno

	$x += 83;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(93, $altura, $cidade, 0);//contorno

	$y += 7.5;
	$x = 16;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $sigla, 0);//contorno

	$x += 12;
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
	$x = 16;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $profissao, 0);//contorno

	$x = 60;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(75, $altura, $renda, 0);//contorno

	$x = 99;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(95, $altura, $email, 0);//contorno


//*************************
//DADOS ADICIONAIS
	$y += 21;
	$x = 22;
	
	if ($contador_deps>0){
		//13 PETS POR PÁGINA
		$qtde_paginas = ceil(count($dependentes)/9);//ARREDONDA PARA CIMA A QTDE DE PÁGINAS

		$cont_deps = 1;//CONTADOR DE PETS IMPRESSOS
		$cont_paginas = 1;//CONTADOR DE PÁGINAS

		//LOOP PELOS DEPENDENTES PETS

		//echo count($dependentes)." pets<br>";
		//echo "LOOP PELOS DEPENDENTES PETS<br>";

		for($i=0; $i<count($dependentes); $i++){
			$x = 22;
			$dados_dep = $dependentes[$i];
			$dep_preco = $dados_dep[0];
			$dep_telefone = $dados_dep[1];
			$dep_data_nascimento = $dados_dep[2];
			$dep_nome_pessoa = $dados_dep[3];
			$dep_cpf = $dados_dep[4];
			$dep_pedido = $dados_dep[5];
			$dep_sexo = $dados_dep[6];
			
			if ($i==3){$y += 6;}
			if ($i==4){$y -= 1;}
			//DEPENTENDE 1
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(76, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno
		
			$x = 100;
			//Bairro Titular
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(22, $altura, $dep_cpf, 0);//contorno
			
			//Sexo
			if ($dep_sexo=='F'){
				$x = 123;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'X', 0);//contorno
			}
			if ($dep_sexo=='M'){
				$x = 129.5;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'X', 0);//contorno
			}
		
			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'    '.$data_nasc[1].'   '.$data_nasc[0];
			
				$x = 137;
				$pdf->SetFont('times', '', 10);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
			$x = 159;
			//Bairro Titular
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(22, $altura, $dep_telefone, 0);//contorno

			if ($i>2){
				if ($dep_preco>1){
					$x = 185;
					//Bairro Titular
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(22, $altura, $dep_preco, 0);//contorno
				}else{
					$x = 185;
					//Bairro Titular
					$pdf->SetFont('times', '', 9);
					$pdf->SetXY($x, $y);
					$pdf->Cell(22, $altura, 0.00, 0);//contorno
				}
			}
			
			$cont_deps++;//INCREMENTA A QTDE DE PETS
			if ($cont_deps>9 and $cont_paginas<$qtde_paginas){
				$cont_deps = 1;
				$cont_paginas++;

				//PÁGINA 2 ####################
				$pdf->AddPage();
				$linhas = 1;
				$x = 0;
				$y = 0;
				$logo = 'contratos/bom_med/02.jpg';//cria nome da imagem de cabecalho
				$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
			
				$x = 20;
				$y += 50.5;
				//Adesão
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(118, $altura, '50,32', 0);//contorno
			
				$x = 48;
				//Plano Padrão
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(118, $altura, '60,12', 0);//contorno
			
				$x = 73;
				//Dependente(adicional)
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(118, $altura, '80,33', 0);//contorno
				
				$x = 98;
				//Mensalidade total
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(118, $altura, '198,44', 0);//contorno
			
				
			
			///*******************VENCIMENTO
				$y += 9.5;
				$vencimento = '10';
				//Sexo
				if ($vencimento=='10'){
					$x = 16;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura, 'X', 0);//contorno
				}
				$vencimento = '15';
				//Sexo
				if ($vencimento=='15'){
					$x = 42;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura, 'X', 0);//contorno
				}
				$vencimento = '20';
				//Sexo
				if ($vencimento=='20'){
					$x = 68.5;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura, 'X', 0);//contorno
				}
				$vencimento = '25';
				//Sexo
				if ($vencimento=='25'){
					$x = 95;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura, 'X', 0);//contorno
				}
			
				$x = 16;
				$y += 12;
				//Adesão
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(118, $altura, $cliente, 0);//contorno
			
				//Sexo
				if ($sexo=='MASCULINO'){
					$x = 138;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura, 'X', 0);//contorno
				}
				if ($sexo=='FEMININO'){
					$x = 143;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura, 'X', 0);//contorno
				}
			
				//Est. Civil
				if ($estado_civil=='SOLTEIRO'){
					$x = 151;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura, 'X', 0);//contorno
				}
				if($estado_civil=='CASADO'){
					$x = 155;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura, 'X', 0);//contorno
				}
				if($estado_civil=='OUTROS'){
					$x = 161;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura, 'X', 0);//contorno
				}
				//Data de nascimento
				if ($data_nascimento<>''){
					$data_nasc = explode('-',$data_nascimento);
					$temp = $data_nasc[2].'     '.$data_nasc[1].'    '.$data_nasc[0];
				
					$x = 170;
					$pdf->SetXY($x, $y);
					$pdf->Cell(4, $altura, $temp, 0);//contorno
				}
				$y += 8;
				$x = 16;
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
				$x = 16;
				//Endereço Titular
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(157, $altura, $endereco, 0);//contorno
			
				$x = 178;
				//Número endereço Titular
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(18, $altura, $numero, 0);//contorno
			
				$y += 7.5;
				$x = 16;
				//Bairro Titular
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(78, $altura, $bairro, 0);//contorno
			
				$x += 83;
				//Cidade Titular
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(93, $altura, $cidade, 0);//contorno
			
				$y += 7.5;
				$x = 16;
				//Estado endereço Titular
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $sigla, 0);//contorno
			
				$x += 12;
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
				$x = 16;
				//Bairro Titular
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(75, $altura, $profissao, 0);//contorno
			
				$x = 60;
				//Bairro Titular
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(75, $altura, $renda, 0);//contorno
			
				$x = 99;
				//Cidade Titular
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(95, $altura, $email, 0);//contorno

				$x = 25;
				$y += 27;
			
			}else{
				$y += 6.5;
				$x = 22;
			}
		}	
	}

//*************************************
//*******TOTAL GERAL**********
	$y = 195;
	$x = 170;
	//TOTAL
	$pdf->SetFont('times', '', 9);
	$pdf->SetXY($x, $y);
	$pdf->Cell(22, $altura, Formata_valor($total_dep), 0);//contorno

//*************************************
//*******OBSERVAÇÃO**********
/*
	$y += 6;
	$x = 25;
	//TOTAL
	$pdf->SetFont('times', '', 9);
	$pdf->SetXY($x, $y);
	$pdf->Cell(160, $altura, utf8_decode($observacoes), 0);//contorno
*/
//*************************************
//*******DATA **********
	$y = 213;
	$x = 25;
	$mes_emissao = Retorna_mes($mes_emissao);
	//Data
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(8, $altura, $dia_emissao);
	$pdf->SetXY($x+15, $y);
	$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+42, $y);
	$pdf->Cell(8, $altura, $ano_emissao);

//*************************************
//*******TIPO DE COBRANÇA**********

	if ($cob_plano_pagamento==1643483 or $cob_plano_pagamento==48286734 or $cob_plano_pagamento==48296791 or $cob_plano_pagamento==25451){
		//Tipo de cobrança
		$y = 213.5;
		$x = 150;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	/*else{
		//Tipo de Cobrança
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
	$logo = 'contratos/bom_med/03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_med/04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_med/05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_med/06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$ano_reduzido = substr($ano_emissao, 2, 2);
	$x = 115;
	$y = 195;
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+18, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+59, $y);
	$pdf->Cell(30, $altura, $ano_reduzido);
	
	//ASSINATURA 450x200 -> 45x20
/*	$assinatura = "../../acess_bompastor/assinaturas/$pedido".'.png';
	$x = 127;
	$y = 257;
	$pdf->Image($assinatura, $x, $y, 45, 20, "PNG");
*/	
	$pdf->Output('bom_med'.$pedido.'.pdf', "I");
	
	$pdf->Output('bom_medpedido.pdf', "I");
}else{
	exit;
}
?>