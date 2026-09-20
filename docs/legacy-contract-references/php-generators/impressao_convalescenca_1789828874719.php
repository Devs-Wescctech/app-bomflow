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

	include("api_convalescenca/api_pesquisa_assinatura_convalescenca.php");
	include("api_convalescenca/api_pesquisa_assinatura_convalescenca_endereco.php");

	//$valor_quilometragem='0';
	//BUSCA DATA DA ASSINATURA DO CONTRATO
	
	$tb_contratos_assinaturas = @mysqli_query($db, "SELECT * FROM contratos_assinaturas WHERE contrato_numero='$pedido'");
	if (mysqli_num_rows($tb_contratos_assinaturas)<>0){
		$dados_assinatura = mysqli_fetch_array($tb_contratos_assinaturas);
		$data = $dados_assinatura["data"];
		$dia = Pega_dia($data);
		$mes = Pega_mes($data);
		$mes_numero = $mes;
		$ano = Pega_ano($data);
		$mes = Retorna_mes($mes);//descrição
	}else{
		$dia = date("d");
		$mes = date("m");
		$mes_numero = $mes;
		$ano = date("Y");
		$mes = Retorna_mes($mes);//descrição
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
	$logo = 'contratos/convalescenca/01.jpg';//cria nome da imagem de cabecalho
	$pdf->Image($logo, $x, $y, 210, 297, "JPEG");
	
	$x = 40;
	$y = 49.5;
	//Adesão
	//Nome titular
	$pdf->SetFont('times', '', 7);
	$pdf->SetXY($x, $y);
	$pdf->Cell(118, $altura, $titular_nome, 0);//contorno

	//CPF
	$x = 40;
	$y = 55;
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $documento, 0);//contorno


	if ($complemento<>''){
		$uniao_endereco = $endereco_residencial.' - '.$complemento; 
	}else{
		$uniao_endereco = $endereco_residencial; 
	}

	//###################################
	//Endereco
	$x = 132;
	$y = 55;
	$pdf->SetFont('times', '', 7);		
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $uniao_endereco, 0);//contorno
	
	//###################################
	//NUMERO
	$x = 110;
	$y = 60;
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $numero, 0);//contorno

	//Bairro
	$x = 130;
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $bairro, 0);//contorno

	//###################################
	//Cidade
	$x = 40;
	$y= 65.5;
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $cidade, 0);//contorno

	//Fone pessoal
	$x = 112;
	$pdf->SetXY($x, $y);
	$pdf->Cell(4, $altura, $celular, 0);//contorno

	//*******************1.OBJETO************//
	/////////////***************************//
	$x = 55;
	$y = 90;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 8);
	$pdf->Cell(35, $altura, $tipo_equipamento, 0, 0, "L");//contorno

	$x = 168;
	$y = 90;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 8);
	$pdf->Cell(35, $altura, $qtde_equipamentos, 0, 0, "L");//contorno

	$x = 50;
	$y = 95;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 7);
	$pdf->Cell(35, $altura, Mostra_data($data_retirada), 0, 0, "L");//contorno

	$x = 110;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 7);
	$pdf->Cell(35, $altura, Mostra_data($data_devolucao), 0, 0, "L");//contorno

	$endereco_completo = $uniao_endereco.' , '.$numero.' - '.$bairro.' - '.$cidade; 

	$x = 70;
	$y = 101;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 7);
	$pdf->Cell(35, $altura, $endereco_completo, 0, 0, "L");//contorno

	//1.1 - LOCATÁRIO
	$x = 125;
	$y = 106;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 7);
	$pdf->Cell(35, $altura, $locatario, 0, 0, "L");//contorno


	//2.1 - QUANTIA PAGA MENSALMENTE
	$x = 116;
	$y = 128;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 7);
	$pdf->Cell(35, $altura, Formata_valor($valor_custo), 0, 0, "L");//contorno

	//2.4 - DEIXAR 30 COMO PADRÃO
	$x = 100;
	$y = 155;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 7);
	$pdf->Cell(35, $altura, '30', 0, 0, "L");//contorno

	$x = 40;
	$y = 244;
	$pdf->SetFont('times', '', 7);
	$pdf->SetXY($x, $y);
	$pdf->Cell(30, $altura, $dia);
	$pdf->SetXY($x+11, $y);
	$pdf->Cell(30, $altura, $mes_numero);
	$pdf->SetXY($x+21, $y);
	$pdf->Cell(30, $altura, $ano);

	$x = 30;
	$y = 251;
	$pdf->SetXY($x, $y);
	$pdf->SetFont('times', '', 9);
	$pdf->Cell(0, $altura, 'Companhia Nacional de Planos Assistenciais Ltda.');


	//ASSINATURA 450x200 -> 45x20
	/*
	$assinatura = "../../acess_bompastor/assinaturas/$pedido".'.png';
	$x = 125;
	$y = 245;
	$pdf->Image($assinatura, $x, $y, 45, 20, "PNG");
	*/
	$pdf->Output('convalescenca'.$pedido.'.pdf', "I");
}else{
	exit;
}
?>