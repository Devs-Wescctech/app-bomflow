<?php
//$cpf = $_GET["cpf"];
//$cpf='038.575.888-02';
//PESQUISA DE CONTRATOS
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_PESQUISA_ASSINATURA_IDEAL?documento=$cpf&pedido=$pedido",
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
/*
echo $response;
echo "<br><br><br>";
exit;
*/

$json = json_decode($response, true);
//echo "<strong>API_PESQUISA_ASSINATURA</strong><br>";
foreach($json as $json){
	$pedido = $json["pedido"];
	$documento = $json["documento"];
	$titular_nome = $json["nome_completo"];
	$data_emissao = @$json["data_emissao"];
	$observacoes = @$json["observacoes"];
	/*echo "
	pedido: $pedido<br>
	documento: $documento<br>
	nome_completo:$titular_nome<br>
	data_emissao: $data_emissao<br><br>
	";
	*/
	
}
/*if ($response==''){
	$pedido=0;	
}
*/
//------------------------------------------------
?>