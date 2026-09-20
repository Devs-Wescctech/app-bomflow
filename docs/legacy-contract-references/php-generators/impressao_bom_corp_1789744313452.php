<?php
require_once("../../acess_bompastor/conexao.php");
require_once("../../acess_bompastor/util.php");
/*******************************************************************
IMPRESSÃO PDF CONTRATO BOM FAMILIA
*******************************************************************/

//Recebe dados
if (@$_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"]<>'' and @$_GET["skdfeioHHHksdjskJJ"]<>''){
	$cnpj = $_GET["gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei"];
	$contrato = $_GET["skdfeioHHHksdjskJJ"];
	//decodifica
	$cnpj = base64_decode(strrev(base64_decode(base64_decode($cnpj))));
	$contrato = base64_decode(strrev(base64_decode(base64_decode($contrato))));

	include("api_bomcorp_recepcao/api_bomcorp_pessoas.php");
	include("api_bomcorp_recepcao/api_bomcorp_titular.php");	
	include("api_bomcorp_recepcao/api_bomcorp_cob_titulares.php");	

	if ($data_aprovacao<>''){
		$dia_emissao = Pega_dia($data_aprovacao);
		$mes_emissao = Pega_mes($data_aprovacao);
		$ano_emissao = Pega_ano($data_aprovacao);
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
	$logo = 'contratos/bom_corp/01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 2 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_corp/02.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_corp/03.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$y = 44;
	if ($produto==121121){
	///**********TIPO PRODUTO - ESSENTIALS
		$x = 29;
		//Adesão
		$pdf->SetFont('times', '', 15);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
	}
	/*if ($produto==''){
	///**********TIPO PRODUTO - PLUS
		$x = 65;
		//Adesão
		$pdf->SetFont('times', '', 15);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, $produto, 0);//contorno
	}*/
	
	if ($produto==121122){
	///**********TIPO PRODUTO - PRIME
		$x = 101;
		//Adesão
		$pdf->SetFont('times', '', 15);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
	}
	if ($produto==121123){
	///**********TIPO PRODUTO - TOTAL
		$x = 137;
		//Adesão
		$pdf->SetFont('times', '', 15);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
	}
	if ($produto==121124){
	///**********TIPO PRODUTO - FLEX
		$x = 172;
		//Adesão
		$pdf->SetFont('times', '', 15);
		$pdf->SetXY($x, $y);
		$pdf->Cell(118, $altura, 'X', 0);//contorno
	}
///**********TITULAR
	$y = 56;
	$x = 25;
	//Adesão
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno


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
	$pdf->Cell(118, $altura, $$inscricao_estadual , 0);//contorno

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

	$y += 7;
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

	$y +=7;
	$x = 25;
	//Cidade Titular
	$pdf->SetFont('times', '', 10);
	$pdf->SetXY($x, $y);
	$pdf->Cell(43, $altura, $email, 0);//contorno

	$x=24;
	$y +=7.5;
	$tot_dep=count($dependentes);
	$w=1;
	for($i=0; $i<count($dependentes); $i++){
			$dados_dependentes = $dependentes[$i];
			$dep_nome = $dados_dependentes[0];
			$dep_documento = $dados_dependentes[1];
			$dep_data_nasc = $dados_dependentes[2];
			$dep_celular = $dados_dependentes[3];

			$pdf->SetFont('times', '', 10);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, utf8_decode($dep_nome), 0);//contorno
			
			$x=105;
			$pdf->SetFont('times', '', 11);
			$pdf->SetXY($x, $y);
			$pdf->Cell(118, $altura, $dep_documento, 0);//contorno

			//Data de nascimento
			if ($dep_data_nasc<>''){
				$data_nasc = explode('-',$dep_data_nasc);
				$temp = $data_nasc[2].'     '.$data_nasc[1].'    '.$data_nasc[0];
							
				$x = 144;
				$pdf->SetFont('times', '', 10);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $temp, 0);//contorno
			}
			//Data de nascimento
			if ($dep_celular<>''){
						
				$x = 175;
				$pdf->SetFont('times', '', 11);
				$pdf->SetXY($x, $y);
				$pdf->Cell(4, $altura, $dep_celular, 0);//contorno
			}
			$x=25;
			if ($w>=3){$y +=5.5;}else{$y +=6;}
			$w++;
			if($w==23){
				$w=1;
				//OBSERVAÇÃO
				//*************************************
					$x = 35;
					$y = 222;
					$pdf->SetXY($x, $y);
					$pdf->SetFont('times', '', 9);
					$pdf->MultiCell(180, $altura, $observacoes, 0, "L");//contorno
				
					$y = 242;
					$x = 36;
					//Data
					$pdf->SetFont('times', '', 11);
					$pdf->SetXY($x, $y);
					$pdf->Cell(8, $altura, $dia_emissao);
					$pdf->SetXY($x+14, $y);
					$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
					$pdf->SetXY($x+38, $y);
					$pdf->Cell(8, $altura, $ano_emissao);
				
					$x = 115;
					//NÚMERO DE VIDAS
					$pdf->SetFont('times', '', 11);
					$pdf->SetXY($x, $y);
					$pdf->Cell(8, $altura, $tot_dep, 0);
				
					$x = 165;
					//VALOR TOTAL
					$pdf->SetFont('times', '', 11);
					$pdf->SetXY($x, $y);
					$pdf->Cell(8, $altura, Formata_valor($valor), 0);
					
					//PÁGINA 3 ####################
					$pdf->AddPage();
					$linhas = 1;
					$x = 0;
					$y = 0;
					$logo = 'contratos/bom_corp/03.jpg';//cria nome da imagem de cabecalho
					$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
				
					$y = 44;
					if ($produto==121121){
					///**********TIPO PRODUTO - ESSENTIALS
						$x = 29;
						//Adesão
						$pdf->SetFont('times', '', 15);
						$pdf->SetXY($x, $y);
						$pdf->Cell(118, $altura, 'X', 0);//contorno
					}
					/*if ($produto==''){
					///**********TIPO PRODUTO - PLUS
						$x = 65;
						//Adesão
						$pdf->SetFont('times', '', 15);
						$pdf->SetXY($x, $y);
						$pdf->Cell(118, $altura, $produto, 0);//contorno
					}*/
					
					if ($produto==121122){
					///**********TIPO PRODUTO - PRIME
						$x = 101;
						//Adesão
						$pdf->SetFont('times', '', 15);
						$pdf->SetXY($x, $y);
						$pdf->Cell(118, $altura, 'X', 0);//contorno
					}
					if ($produto==121123){
					///**********TIPO PRODUTO - TOTAL
						$x = 137;
						//Adesão
						$pdf->SetFont('times', '', 15);
						$pdf->SetXY($x, $y);
						$pdf->Cell(118, $altura, 'X', 0);//contorno
					}
					if ($produto==121124){
					///**********TIPO PRODUTO - FLEX
						$x = 172;
						//Adesão
						$pdf->SetFont('times', '', 15);
						$pdf->SetXY($x, $y);
						$pdf->Cell(118, $altura, 'X', 0);//contorno
					}
				///**********TITULAR
					$y = 56;
					$x = 25;
					//Adesão
					$pdf->SetFont('times', '', 11);
					$pdf->SetXY($x, $y);
					$pdf->Cell(118, $altura, utf8_decode($cliente), 0);//contorno
				
				
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
					$pdf->Cell(118, $altura, $$inscricao_estadual , 0);//contorno
				
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
				
					$y += 7;
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
				
					$y +=7;
					$x = 25;
					//Cidade Titular
					$pdf->SetFont('times', '', 10);
					$pdf->SetXY($x, $y);
					$pdf->Cell(43, $altura, $email, 0);//contorno
				
					$x=24;
					$y +=7.5;
				}
		}//for
		
		if($w<22){
				//OBSERVAÇÃO
				//*************************************
					$x = 35;
					$y = 222;
					$pdf->SetXY($x, $y);
					$pdf->SetFont('times', '', 9);
					$pdf->MultiCell(180, $altura, $observacoes, 0, "L");//contorno
				
					$y = 242;
					$x = 36;
					//Data
					$pdf->SetFont('times', '', 11);
					$pdf->SetXY($x, $y);
					$pdf->Cell(8, $altura, $dia_emissao);
					$pdf->SetXY($x+14, $y);
					$pdf->Cell(20, $altura, utf8_decode($mes_emissao));
					$pdf->SetXY($x+38, $y);
					$pdf->Cell(8, $altura, $ano_emissao);
				
					$x = 115;
					//NÚMERO DE VIDAS
					$pdf->SetFont('times', '', 11);
					$pdf->SetXY($x, $y);
					$pdf->Cell(8, $altura, $tot_dep, 0);
				
					$x = 165;
					//VALOR TOTAL
					$pdf->SetFont('times', '', 11);
					$pdf->SetXY($x, $y);
					$pdf->Cell(8, $altura, Formata_valor($valor), 0);
		}
	

	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_corp/04.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

/*
	$y = 180;
	$x = 20;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $documento, 0);//contorno

	$x = 60;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $cidade, 0);//contorno

	$y +=5;
	$x = 40;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $endereco, 0);//contorno
	
	$y +=5;
	$x = 100;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $codigo_postal, 0);//contorno

	$x = 110;
	//Estado endereço Titular
	$pdf->SetFont('times', '', 11);
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $numero, 0);//contorno
	
*/	
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_corp/05.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_corp/06.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_corp/07.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_corp/08.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_corp/09.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_corp/10.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	
	//PÁGINA 3 ####################
	$pdf->AddPage();
	$linhas = 1;
	$x = 0;
	$y = 0;
	$logo = 'contratos/bom_corp/11.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");

	$ano_reduzido = substr($ano_emissao, 2, 4);
	
	$x = 115;
	$y = 230;
	$pdf->SetFont('times', '', 12);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia_emissao);
	$pdf->SetXY($x+16, $y);
	$pdf->Cell(30, $altura, utf8_decode($mes_emissao));
	$pdf->SetXY($x+58, $y);
	$pdf->Cell(30, $altura, $ano_reduzido);

	$pdf->Output('bom_corp'.$contrato.'.pdf', "I");
}else{
	exit;
}
?>