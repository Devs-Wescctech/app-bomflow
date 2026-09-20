<?php
//INVERTE DATA
//$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf='761.499.786-72';
//$data_nascimento = '1951-12-04';


//echo "dados_pesquisa: $dados_pesquisa<br>";

/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_TOTAL_MAIS_TANATO?documento=$cpf&pedido=$pedido",
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
/*
echo "<strong>response:</strong><br>";
echo $response;
echo "<br><br>";
*/

$json = json_decode($response, true);

$pedido_tanato='';
$documento_tanato='';
$total_valor_tanato='';
$descricao_tanato='';
$tem_tanato='';
$pedido_cremacao='';

if (@$json["error"]==''){

	foreach($json as $json){
		$pedido_cremacao = $json["pedido"];
		//$documento = $json["documento"];
		$total_valor_tanotapraxia = $json["total_valor"];
    
    /*
		echo "
		total: $total<br>
		pedido: $pedido<br>
		documento: $documento<br>
		total_valor_cremacao: $total_valor_tanotapraxia<br><br>
    ";
    */	
		
	}
}

?>