<?php
$cpf = $_GET["cpf_cliente"];;
$data_nascimento = $_GET["data_nascimento_cliente"];;
//INVERTE DATA
$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf = '238.886.286-87';
//$data_nascimento = '1951-12-04';

$dados_pesquisa = "cpf=$cpf&data_nascimento=$data_nascimento";

//echo "dados_pesquisa: $dados_pesquisa<br>";

/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_V_BOMPET?$dados_pesquisa",
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
if ($response<>''){
	foreach($response as $dados){
			
		$tipo = $dados["tipo"];
		$situacao = $dados["situacao"];
		$data_nascimento = $dados["data_nascimento"];
		$documento = $dados["documento"];
		$canal = $dados["canal"];
		$sexo = $dados["sexo"];
		$nome_completo = $dados["nome_completo"];
	
		$dados = "$situacao@$data_nascimento@$documento@$canal@$sexo@$nome_completo";
		echo $dados;
		/*
		echo "
		tipo: $tipo<br>
		situacao: $situacao<br>
		Data Nasc: $data_nascimento<br>
		CPF: $documento<br>
		Canal: $canal<br>
		Sexo: $sexo<br>
		Nome: $nome_completo<br><br>
		";
		*/
	}
}else{
	echo "Não encontrado";
	
}
?>