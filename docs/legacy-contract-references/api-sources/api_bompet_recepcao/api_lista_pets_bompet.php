<?php
$dados = $_GET["dados"];
$string = explode('@', $dados);
$situacao = $string[0];
$data_nascimento = $string[1];
$cpf = $string[2];
$canal = $string[3];
$tutor_nome = $string[4];

/*BUSCA OS PETS*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_V_NOMES?documento=$cpf",
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

/*
$response = json_decode($response, true);
foreach($response as $dados){
	$documento = $dados["documento"];
	$cel = $dados["cel"];
	$nome_completo = $dados["nome_completo"];
	$email = $dados["email"];
	
	echo "
	documento: $documento<br>
	cel: $cel<br>
	nome_completo: $nome_completo<br>
	email: $email<br><br>
	";
}
*/
?>