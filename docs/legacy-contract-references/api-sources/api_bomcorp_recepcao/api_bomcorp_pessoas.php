<?php
//INVERTE DATA
//$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf='761.499.786-72';
//$data_nascimento = '1951-12-04';


//echo "dados_pesquisa: $dados_pesquisa<br>";


/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_BOM_CORP_CONTRATO_PESSOAS?documento=$cnpj&contrato=$contrato",
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

/*echo "<pre>";
echo print_r($response);
echo "</pre>";
exit;
*/
if ($response<>''){
 	$dep_data_nasc='';
	$dep_documento='';
	$dependente='';
	$dep_celular='';
	$cont = 0;
	$dependentes = array();
	foreach ($response as $chave => $valor){
		//echo "<strong>Dependente: $cont</strong><br>";
		foreach ($valor as $chave_um => $valor_um){
			if ($chave_um=='dep_data_nasc'){$dep_data_nasc = $valor_um;}
			if ($chave_um=='dep_documento'){$dep_documento = $valor_um;}
			if ($chave_um=='dependente'){$dependente = $valor_um;}
			if ($chave_um=='dep_celular'){$dep_celular = $valor_um;}
		}
		if(in_array($dep_documento, $dependentes)==false){
			$dependentes[] = array($dependente, $dep_documento, $dep_data_nasc, $dep_celular);
			$cont++;
		}	
//echo "<strong>Dependente: $dependente</strong><br>";		
	}
	// Extraindo a primeira coluna
	$coluna = array_column($dependentes, 0);
	
	// Ordenando pelo primeiro item de cada subarray
	array_multisort($coluna, SORT_ASC, $dependentes);
	
	// Imprimindo o resultado
	//print_r($dependentes);	
}
?>