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
	
	include("api_safira_recepcao/api_safira_pesquisa_titular.php");
	include("api_safira_recepcao/api_safira_titular.php");
	include("api_safira_recepcao/api_safira_dependentes.php");
	include("api_safira_recepcao/api_dados_cob_safira.php");

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
	$logo = 'contratos/plano_safira/01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_safira/02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_safira/03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_safira/04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_safira/05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	$x = 27;
	$y = 52;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($cob_adesao), 0);//contorno
	
	$valor_base=0;
	$valor_base=$cob_total_valor - $total_dep;
	if($valor_base<1){$valor_base=0;}
	$x = 51;
	//Plano Padrão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($valor_base), 0);//contorno

	$x = 73;
	//Dependente(adicional)
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($total_dep), 0);//contorno
	
	$mensalidade_total=0;
	$mensalidade_total = $valor_base + $total_dep;
	$x = 98;
	//Mensalidade total
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, Formata_valor($mensalidade_total), 0);//contorno

	

///*******************VENCIMENTO
	$y = 51;
	
	//Vencimento
	if ($vencimento=='10'){
		$x = 120;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='15'){
		$x = 137;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='20'){
		$x = 154;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	//Vencimento
	if ($vencimento=='25'){
		$x = 171;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, 'X', 0);//contorno
	}
	
	$x = 24;
	$y = 62;
	//Cliente
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno
	//Sexo
	$x = 147;
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
	
		$x = 179;
		$pdf->SetXY($x, $y);
		$pdf->Cell(4, $altura, $temp, 0);//contorno
	}
	$y = 69;
	$x = 24;
	//CPF Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(100, $altura, $documento, 0);//contorno

	$y = 69;
	$x =118;
	//RG Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura,  $rg, 0);//contorno

	$y = 77;
	$x = 24;
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
	
	$y = 76;
	$x = 186;
	//Número endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(18, $altura, $numero, 0);//contorno

	$y = 84;
	$x = 24;
	//Bairro Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(78, $altura, utf8_decode($bairro), 0);//contorno

	$y = 84;
	$x += 84;
	//Cidade Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(93, $altura, utf8_decode($cidade), 0);//contorno

	$y = 92;
	$x = 24;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $sigla, 0);//contorno

	$x = 36;
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

	$x += 56;
	//cep Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(67, $altura, $telefone2, 0);//contorno

//**** NOVA LINHA
	$y = 98;
	$x = 24;
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
				$y=107;
			}
			if($dep_parentesco=='Mãe'){	
				$x=23;
				$y=114;
			}
			if($dep_parentesco=='Sogro/Sogra' and $dep_sexo=='M'){				
				$x=23;
				$y=122;
			}
			if($dep_parentesco=='Sogro/Sogra' and $dep_sexo=='F'){				
				$x=23;
				$y=130;
			}
			if($dep_parentesco=='Cônjuge'){
				$x=23;
				$y=137;
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
		$y=144.5;
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
		$x = 32;
		$y = 226;
		$dep_valor_total=0;
		for($i=0; $i<count($dependentes); $i++){
			$dados_dependentes = $dependentes[$i];
			$dep_preco = $dados_dependentes[0];
			$dep_telefone = $dados_dependentes[1];
			$dep_data_nascimento = $dados_dependentes[2];
			$dep_nome_pessoa = $dados_dependentes[3];
			$dep_sexo = $dados_dependentes[6];
			$dep_parentesco = $dados_dependentes[7];
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, utf8_decode($dep_nome_pessoa), 0);//contorno

			//Sexo
			$x = 110;
			if ($dep_sexo=='F'){
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}
			$x = 117;
			if ($dep_sexo=='M'){
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, 'x', 0);//contorno
			}
									
			//Data de nascimento
			if ($dep_data_nascimento<>''){
				$data_nasc = explode('-',$dep_data_nascimento);
				$temp = $data_nasc[2].'      '.$data_nasc[1].'    '.$data_nasc[0];
							
				$x = 145;
				$pdf->SetFont('times', '', 9);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
				$x = 170;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $dep_telefone, 0);//contorno

			if ($dep_preco>2){
				$x = 193;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $dep_preco, 0);//contorno
				$dep_valor_total=$dep_valor_total+$dep_preco;
			}else{
				$x = 193;
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, '0.00', 0);//contorno
			}
			$y +=8;
			$x=32;
		}
			$x = 175;
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, Formata_valor($dep_valor_total), 0);//contorno
	}
			$x = 34;
			$y =248;
			$pdf->SetFont('times', '', 9);
			$pdf->SetXY($x, $y);
			$pdf->Cell(4, $altura, utf8_decode($observacoes), 0);//contorno
	
	
//OBSERVAÇÃO
//*************************************
//*******DATA **********
	$y = 257;
	$x = 34;
	//Data
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(8, $altura, $dia_emissao);
	$pdf->SetXY($x+15, $y);
	$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+42, $y);
	$pdf->Cell(8, $altura, $ano_emissao);

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
	$logo = 'contratos/plano_safira/06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 4 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_safira/07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 5 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_safira/08.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 6 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_safira/09.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 7 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/plano_safira/10.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$x = 131;
	$y = 228;
	$ano_reduzido = substr($ano_emissao, 2, 4);
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+18, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+59, $y);
	$pdf->Cell(30, $altura, $ano_reduzido);

	$pdf->Output('plano_safira'.$pedido.'.pdf', "I");
}else{
	exit;
}

?>