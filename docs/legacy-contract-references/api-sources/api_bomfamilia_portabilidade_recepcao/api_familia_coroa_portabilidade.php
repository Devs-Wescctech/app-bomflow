<?php
/**************************************************
5 - API_DADOS_CREMACAO_ASSINATURA
**************************************************/
$total = '0';//quantidade
$total_valor_coroa = '0';

$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_DADOS_COROA_FAMILIA_PORT?documento=$cpf&pedido=$pedido",
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
//echo "<strong>5 - API_DADOS_CREMACAO_ASSINATURA</strong><br>";
$pedido_coroa='';

$json = json_decode($response, true);
if(!empty($json)){
	//echo "<strong>5 - API_DADOS_CREMACAO_ASSINATURA</strong><br>";

	foreach($json as $json){
		$total = $json["total"];//quantidade
		$pedido_coroa = $json["pedido"];
		$total_valor_coroa = $json["total_valor"];
		$quant_coroa = $json["quantidade"];
		/*
		echo "
		total: $total<br>
		pedido: $pedido<br>
		documento: $documento<br>
		total_valor_cremacao: $total_valor_cremacao<br><br>
		";
		*/
	}
}
//exit;
//------------------------------------------------
?>