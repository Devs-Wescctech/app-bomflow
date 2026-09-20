<?php
//$cpf="086.426.948.07";
/**************************************************
3 - API_DADOS_TOTAL_ASSINATURA
**************************************************/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_DADOS_TOTAL_ASSINATURA?documento=$cpf&pedido=$pedido",
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
$json = json_decode($response, true);
$data_emissao='';
//echo "<strong>3 - API_DADOS_TOTAL_ASSINATURA</strong><br>";
foreach($json as $json){
	$mensalidade_total = $json["valor_total"];
	$dia_vencimento = $json["dia_vencimento"];
	$pedido = $json["pedido"];
	$documento = $json["documento"];
	$observacoes = $json["observacoes"];
	$data_emissao = $json["data_emissao"];
	/*
	echo "
	mensalidade_total: $mensalidade_total<br>
	dia_vencimento: $dia_vencimento<br>
	pedido: $pedido<br>
	documento: $documento<br><br>
	";
	*/
}
//exit;
//------------------------------------------------
?>