<?php
/**************************************************
7 - API_DEPENDENTES_ASSINATURA
**************************************************/

$cpf = '302.298.578-92';


$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_DEPENDENTES_ASSINATURA?documento=$cpf",
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
echo $response;
echo "<br><br><br>";
//exit;
$json = json_decode($response, true);
//echo "<strong>7 - API_DEPENDENTES_ASSINATURA</strong><br>";
$preco = '';
$telefone = '';
$data_nascimento = '';
$nome_pessoa = '';
$sexo = '';
$cont = 1;
$dependentes = array();
foreach ($json as $chave => $valor){
	//echo "<strong>Dependente: $cont</strong><br>";
	foreach ($valor as $chave_um => $valor_um){
		if ($chave_um=='preco'){$preco = $valor_um;}
		if ($chave_um=='telefone'){$telefone = $valor_um;}
		if ($chave_um=='data_nascimento'){$data_nascimento = $valor_um;}
		if ($chave_um=='nome_pessoa'){$nome_pessoa = utf8_decode($valor_um);}
		if ($chave_um=='sexo'){$sexo = $valor_um;}
	}
	echo "
	preco: $preco<br>
	telefone: $telefone<br>
	data_nascimento: $data_nascimento<br>
	nome_pessoa: $nome_pessoa<br>
	sexo: $sexo<br><br>
	";
	$dependentes[] = array($nome_pessoa, $sexo, $data_nascimento, $telefone, $preco);
	$cont++;
}
?>