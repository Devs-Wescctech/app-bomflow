<?php
/**************************************************
5 - API_DADOS_CREMACAO_ASSINATURA
**************************************************/
$total = '0';//quantidade
$total_valor_quilometragem = '0';

$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_DADOS_QUILOMETRAGEM_ASSINATURA?documento=$cpf&pedido=$pedido",
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
$total_valor_quilometragem='';
$quant_km='';
$produto_id='';
foreach($json as $json){
	$total = $json["total"];//quantidade
	$pedido_cremacao = $json["pedido"];
	$documento = $json["documento"];
	$total_valor_quilometragem = $json["total_valor"];
	$produto_id = $json["produto_id"];
	if($produto_id=='52247119'){$quant_km='1000';}
	if($produto_id=='114011118'){$quant_km='2000';}
	if($produto_id=='203567296'){$quant_km='500';}
	if($produto_id=='203567310'){$quant_km='1000';}
	if($produto_id=='203567429'){$quant_km='2000';}
	if($produto_id=='203567456'){$quant_km='3000';}
	/*
	echo "
	total: $total<br>
	pedido: $pedido<br>
	documento: $documento<br>
	total_valor_cremacao: $total_valor_cremacao<br><br>
	";
	*/
}
//exit;
//------------------------------------------------
?>