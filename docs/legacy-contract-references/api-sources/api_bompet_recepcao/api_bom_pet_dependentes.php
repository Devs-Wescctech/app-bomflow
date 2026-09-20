<?php
//INVERTE DATA
//$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf='342.952.078-96';
//$data_nascimento = '1951-12-04';


//echo "dados_pesquisa: $dados_pesquisa<br>";

/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_BOM_PET_DEPENDENTES?documento=$cpf&pedido=$pedido",
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

//echo "<strong>response:</strong><br>";
//echo $response;
//echo "<br><br>";

$response = json_decode($response, true);
/*echo "<pre>";
echo print_r($response);
echo "</pre>";
exit;
*/
if ($response<>''){
	$cor2 = '';
	$cor1 = '';
	$raca = '';
	$nome = '';
	$documento = '';
	$cel = '';
	$canal = '';
	$data_nasc = '';
	$sexo = '';
	$email = '';
	
	$cont = 1;
	$dependentes = array();
	foreach ($response as $chave => $valor){
		//echo "<strong>Dependente: $cont</strong><br>";
		foreach ($valor as $chave_um => $valor_um){
			if ($chave_um=='cor2'){$cor2 = $valor_um;}
			if ($chave_um=='cor1'){$cor1 = $valor_um;}
			if ($chave_um=='raca'){$raca = $valor_um;}
			if ($chave_um=='documento'){$documento = $valor_um;}
			if ($chave_um=='nome'){$nome = $valor_um;}		
			if ($chave_um=='cel'){$cel = $valor_um;}
			if ($chave_um=='canal'){$canal = $valor_um;}
			if ($chave_um=='data_nasc'){$data_nasc = $valor_um;}
			if ($chave_um=='sexo'){$sexo = $valor_um;}
			if ($chave_um=='email'){$email = $valor_um;}
		}
	
		/*echo "
		cor1: $cor1<br>
		cor2: $cor2<br>
		raca: $raca<br>
		nome: $nome<br>
		";
		*/
		$dependentes[] = array($cor1, $cor2, $raca, $nome, $data_nasc, $sexo);
		$cont++;
	}
}else{
	echo "Sem dependentes!";
}
?>