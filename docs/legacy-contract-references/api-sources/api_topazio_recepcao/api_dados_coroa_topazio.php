<?php
//INVERTE DATA
//$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf='761.499.786-72';
//$data_nascimento = '1951-12-04';


//echo "dados_pesquisa: $dados_pesquisa<br>";

/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_DADOS_COROA_TOPAZIO?documento=$cpf&pedido=$pedido",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'GET',
  CURLOPT_HTTPHEADER => array(
    'Authorization: Bearer 726F2F6B-8DBE-4952-BA63-6BE2339F05F5',
    'Cookie: JSESSIONID=F13F0A7A2F0D3D8AC2B2D217E023C811; BOMPASTOR.SID=3699165D45F1E702A86A1441E69EBF85'
  ),
));
$response = curl_exec($curl);
curl_close($curl);

/*echo "<strong>response:</strong><br>";
echo $response;
echo "<br><br>";
*/

$response = json_decode($response, true);
/*echo "<pre>";
echo print_r($response);
echo "</pre>";
exit;
*/

$pedido_coroa='';
$documento_coroa='';
$total_valor_coroa='';
$descricao_coroa='';
$tem_coroa='';
if (is_array($response) && !empty($response)) {
	foreach($response as $dados){
		$pedido_coroa =$dados["pedido"];
		$documento_coroa=$dados["pedido"];
		$total_valor_coroa=$dados["total_valor"];
		$descricao_coroa==$dados["descricao"];
	}
	$tem_coroa='SIM';
}else{
	$tem_coroa='NAO';
	$total_valor_coroa=0;
}
?>