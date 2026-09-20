<?php
/**************************************************
7 - API_DEPENDENTES_ASSINATURA
**************************************************/
$dependentes = array();
//echo "pedido: $pedido<br>";
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_DEPENDENTES_ASSINATURA?documento=$cpf&pedido=$pedido",
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
$json = json_decode($response, true);
//echo "<strong>7 - API_DEPENDENTES_ASSINATURA</strong><br>";
$preco_dep = '';
$telefone_dep = '';
$data_nascimento_dep = '';
$nome_pessoa_dep = '';
$sexo_dep = '';
$cont = 1;
$parentesco_dep = '';
$dependentes = array();
foreach ($json as $chave => $valor){
	//echo "<strong>Dependente: $cont</strong><br>";
	foreach ($valor as $chave_um => $valor_um){
		if ($chave_um=='preco'){$preco_dep = $valor_um;}
		if ($chave_um=='telefone'){$telefone_dep = $valor_um;}
		if ($chave_um=='data_nascimento'){$data_nascimento_dep = $valor_um;}
		if ($chave_um=='nome_pessoa'){$nome_pessoa_dep = utf8_decode($valor_um);}
		if ($chave_um=='sexo'){$sexo_dep = $valor_um;}
		if ($chave_um=='parentesco'){$parentesco_dep = $valor_um;}
	}
	$preco_dependentes_confere += $preco_dep;
	/*echo "
	preco: $preco_dep<br>
	telefone: $telefone_dep<br>
	data_nascimento: $data_nascimento_dep<br>
	nome_pessoa: $nome_pessoa_dep<br>
	sexo: $sexo_dep<br><br>
	";
	*/
	$dependentes[] = array($nome_pessoa_dep, $sexo_dep, $data_nascimento_dep, $telefone_dep, $preco_dep, $parentesco_dep);
	$cont++;
}
?>