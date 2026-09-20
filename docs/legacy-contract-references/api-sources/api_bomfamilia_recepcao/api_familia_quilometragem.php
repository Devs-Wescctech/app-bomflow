<?php
//$cpf="024.483.958-10";

/**************************************************
8 - API_QUILOMETRAGEM
**************************************************/

$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_FAMILIA_QUILOMETRAGEM?documento=$cpf&pedido=$pedido",
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
/*echo $response;
echo "<br><br><br>";
exit;
*/
$total = '';
$pedido_quilometragem = '';
$documento = '';
$valor_quilometragem = 0;

$json = json_decode($response, true);
if(!empty($json)){
	//echo "<strong>5 - API_DADOS_CREMACAO_ASSINATURA</strong><br>";
	foreach($json as $json){
		$total = $json["total"];//quantidade
		$pedido_quilometragem = $json["pedido"];
		$documento = $json["documento"];
		$valor_quilometragem = $json["total_valor"];
	}
}
?>