<?php
//$cpf = $_GET["cpf"];
//$cpf='038.575.888-02';
//PESQUISA DE CONTRATOS
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_BOM_CORP_TITULARES?documento=$cnpj",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'GET',
  CURLOPT_HTTPHEADER => array(
	"documento: $cnpj",
	'Authorization: Bearer A6800740-A709-4135-8376-89A0FC284A10',
	'Cookie: JSESSIONID=2F56EEE17E65985AEA4E3FF73846ED66; BOMPASTOR.SID=3699165D45F1E702A86A1441E69EBF85'
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

$codigo_postal = '';
$endereco = '';
$numero = '';
$bairro = '';
$cliente = '';
$documento = '';
$telefone1 = '';
$telefone2 = '';
$inscricao_estadual = '';
$complemento = '';
$cidade = '';
$sigla = '';

if ($response<>''){
	foreach($response as $dados){
            $codigo_postal = $dados["codigo_postal"];
            $endereco = $dados["endereco"];
            $numero = $dados["numero"];
            $bairro = $dados["bairro"];
            $cliente = $dados["contratante"];
            $documento = $dados["documento"];
            $telefone1 = $dados["telefone_celular"];
            $telefone2 = $dados["telefone_comercial"];
            $inscricao_estadual = $dados["inscricao_estadual"];
			$complemento = $dados["complemento"];
	 		$cidade = $dados["cidade"];			
			$email = $dados["email"];			
			$observacoes = $dados["observacoes"];			
            $sigla = '';
	}
}
//------------------------------------------------
?>