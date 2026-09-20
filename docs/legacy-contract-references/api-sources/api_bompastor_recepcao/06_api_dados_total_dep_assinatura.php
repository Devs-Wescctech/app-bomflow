<?php
$total_valor_dependentes = 0;

/**************************************************
6 - API_DADOS_TOTAL_DEP_ASSINATURA
**************************************************/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_DADOS_TOTAL_DEP_ASSINATURA?documento=$cpf&pedido=$pedido",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'GET',
  CURLOPT_HTTPHEADER => array(
	"documento: $cpf",
	'Authorization: Bearer A6800740-A709-4135-8376-89A0FC284A10',
	'Cookie: JSESSIONID=2F56EEE17E65985AEA4E3FF73846ED66; BOMPASTOR.SID=3699165D45F1E702A86A1441E69EBF85'
  ),
));


$response = curl_exec($curl);
curl_close($curl);
//echo $response;
//echo "<br><br><br>";
//exit;
$json = json_decode($response, true);
//echo "<strong>6 - API_DADOS_TOTAL_DEP_ASSINATURA</strong><br>";
//var_dump($json);
//echo "<br><br>";
//DEPENDENTES PODE TER MAIS DE UM ENTÃO É UM ARRAY COM UM OU MAIS ARRAYS DENTRO
$cont = 1;
$total = '0';
$total_valor = 0;
$total_valor_dependentes = 0;
foreach ($json as $chave => $valor){
	//echo "<strong>Dependente: $cont</strong><br>";
	foreach ($valor as $chave_um => $valor_um){
		if ($chave_um=='total'){$total = $valor_um;}//quantidade
		if ($chave_um=='pedido'){$pedido_dep = $valor_um;}
		if ($chave_um=='documento'){$documento = $valor_um;}
		if ($chave_um=='total_valor'){$total_valor = $valor_um;}
	}
	/*
	echo "
	total: $total<br>
	pedido: $pedido<br>
	documento: $documento<br>
	total_valor: $total_valor<br><br>
	";
	*/
	$total_valor_dependentes += $total_valor;
	$cont++;
}
//exit;
//------------------------------------------------
?>