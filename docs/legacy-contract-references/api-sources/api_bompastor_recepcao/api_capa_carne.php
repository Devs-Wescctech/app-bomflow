<?php
/**************************************************
DADOS DO CLIENTE PARA CARNÊ

API_CAPA_CARNE

48260664	549.987.946-04
50909120	099.774.536-32
51069243	331.955.588-07
50909120	063.362.508-65
51638752	526.073.118-29
48005458	214.034.518-50
**************************************************/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_CAPA_CARNE?documento=$cpf",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'GET',
  CURLOPT_HTTPHEADER => array(
	'Authorization: Bearer A6800740-A709-4135-8376-89A0FC284A10',
	'Cookie: JSESSIONID=3699165D45F1E702A86A1441E69EBF85; BOMPASTOR.SID=3699165D45F1E702A86A1441E69EBF85'
  ),
));
$response = curl_exec($curl);
curl_close($curl);
//echo $response;
//echo "<br><br><br>";

$json = json_decode($response, true);
$codigo_postal = '';
$cidade = '';
$pessoa = '';
$endereco = '';
$numero = '';
$bairro = '';
$nome_completo = '';
$vencimento = '';
$cel = '';

if ($json<>''){
	foreach($json as $json){
		$codigo_postal = $json["codigo_postal"];
		$cidade = $json["cidade"];
		$pessoa = $json["pessoa"];
		$endereco = $json["endereco"];
		$numero = $json["numero"];
		$bairro = $json["bairro"];
		$nome_completo = $json["nome_completo"];
		$vencimento = @$json["vencimento"];
		$telefone = @$json["cel"];
	}
}
/*
echo "
codigo_postal: $codigo_postal<br>
cidade: $cidade<br>
pessoa: $pessoa<br>
endereco: $endereco<br>
numero: $numero<br>
bairro: $bairro<br>
nome_completo: $nome_completo<br>
";
*/
?>