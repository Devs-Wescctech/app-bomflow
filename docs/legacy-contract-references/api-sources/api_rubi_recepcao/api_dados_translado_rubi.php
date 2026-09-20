<?php
//INVERTE DATA
//$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf='761.499.786-72';
//$data_nascimento = '1951-12-04';


//echo "dados_pesquisa: $dados_pesquisa<br>";

/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_DADOS_TRANSLADO_RUBI?documento=$cpf&pedido=$pedido",
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
exit;
*/
$response = json_decode($response, true);
/*if (is_array($response) && !empty($response)) {
    // A resposta contém dados, então você pode processá-los
    echo "A API retornou dados!";
    print_r($response); // Exibe os dados retornados
} else {
    // A resposta está vazia ou não é um array
    echo "A API não retornou nenhum dado.";
}exit;	
*/
/*echo "<pre>";
echo print_r($response);
echo "</pre>";
exit;
*/

$pedido_translado='';
$documento_translado='';
$total_valor_translado='';
$tem_translado='NAO';
if (is_array($response) && !empty($response)) {
	foreach($response as $dados){
		$pedido_translado =$dados["pedido"];
		$documento_translado=$dados["documento"];
		$total_valor_translado=$dados["total_valor"];
	}
	$tem_translado='SIM';
}else{
	$tem_translado='NAO';
	$total_valor_translado=0;
}
//echo "tranlado: $tem_translado<br>";
?>