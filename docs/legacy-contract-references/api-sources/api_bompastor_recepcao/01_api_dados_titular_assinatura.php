<?php
/**************************************************
1 - API_DADOS_TITULAR_ASSINATURA
**************************************************/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_DADOS_TITULAR_ASSINATURA?documento=$cpf",
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

$titular_nome = '';
$titular_data_nascimento = '';
$titular_rg = '';
$titular_cpf = '';
$titular_sexo = '';
$titular_estado_civil = '';
$titular_profissao = '';
$titular_renda = '';
$titular_telefone1 = '';
$titular_telefone2 = '';
$titular_email = '';
$titular_cep = '';
$titular_endereco = '';
$titular_numero = '';
$titular_bairro = '';
$titular_cidade = '';
$titular_estado = '';
$titular_profissao = '';
$titular_renda = '';
$titular_complemento = '';

//echo "<strong>1 - API_DADOS_TITULAR_ASSINATURA</strong><br>";
foreach($json as $json){
	$titular_nome = utf8_decode($json["cliente"]);
	$titular_data_nascimento = @$json["data_nascimento"];
	$titular_rg = @$json["rg"];
	$titular_cpf = @$json["documento"];
	$titular_sexo = @$json["sexo"];
	$titular_estado_civil = @$json["estado_civil"];
	$titular_profissao = utf8_decode($json["profissao"]);
	$titular_renda = @$json["renda"];
	$titular_telefone1 = @$json["telefone1"];
	$titular_telefone2 = @$json["telefone2"];
	$titular_email = @$json["email"];
	$titular_cep = @$json["codigo_postal"];
	$titular_endereco = utf8_decode($json["endereco"]);
	$titular_numero = @$json["numero"];
	$titular_complemento = @$json["complemento"];	
	$titular_bairro = utf8_decode($json["bairro"]);
	$titular_cidade = utf8_decode($json["cidade"]);
	$titular_estado = utf8_decode($json["sigla"]);
	$titular_profissao = utf8_decode($json["profissao"]);
	$titular_renda = utf8_decode($json["renda"]);
	$titular_complemento = utf8_decode($titular_complemento);	
/*
	echo "
	cliente: $titular_nome<br>
	data_nascimento: $titular_data_nascimento<br>
	rg:$titular_rg<br>
	cpf: $titular_cpf<br>
	sexo: $titular_sexo<br>
	estado_civil: $titular_estado_civil<br>
	profissao: $titular_profissao<br>
	renda: $titular_renda<br>
	telefone1: $titular_telefone1<br>
	telefone2: $titular_telefone2<br>
	email: $titular_email<br>
	codigo_postal: $titular_cep<br>
	endereco: $titular_endereco<br>
	numero: $titular_numero<br>
	bairro: $titular_bairro<br>
	cidade: $titular_cidade<br>
	estado: $titular_estado<br><br>
	";
*/
}
//------------------------------------------------
?>