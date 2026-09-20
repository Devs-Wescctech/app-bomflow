<?php
//PESQUISA DE CONTRATOS
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_PESQUISA_ASSINATURA_CONVALESCENCA_ENDERECO?documento=$cpf",
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
$cidade = '';
$numero = '';
$bairro = '';
$telefone_comercial = '';
$cep = '';
$complemento = '';
$endereco_residencial = '';
$celular = '';
$telefone_residencial = '';
$email = '';
if ($response<>''){
	foreach ($response as $dados){
		$cidade = utf8_decode($dados["cidade"]);
        $numero = $dados["numero"];
        $bairro = utf8_decode($dados["bairro"]);
        $telefone_comercial = $dados["telefone_comercial"];
        $cep = $dados["cep"];
        $complemento = utf8_decode($dados["complemento"]);
        $endereco_residencial = utf8_decode($dados["endereco_residencial"]);
        $celular = $dados["celular"];
        $telefone_residencial = $dados["telefone_residencial"];
		$nome = utf8_decode($dados["nome_completo"]);
        $email = $dados["email"];
		
	}
}
//------------------------------------------------
?>