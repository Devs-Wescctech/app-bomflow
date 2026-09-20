<?php
//INVERTE DATA
//$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf='326.869.228-18';
//$data_nascimento = '1951-12-04';


//echo "dados_pesquisa: $dados_pesquisa<br>";
//echo $cpf;
/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_BOM_MED_TITULAR?documento=$cpf",
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
*/

$response = json_decode($response, true);
/*echo "<pre>";
echo print_r($response);
echo "</pre>";
*/

if ($response<>''){
	foreach($response as $dados){
	 		$cidade = $dados["cidade"];
            $codigo_postal = $dados["codigo_postal"];
            $sigla = $dados["sigla"];
            $telefone1 = $dados["telefone1"];
            $endereco = $dados["endereco"];
            $numero = $dados["numero"];
            $bairro = $dados["bairro"];
            $estado_civil = $dados["estado_civil"];
            $profissao = $dados["profissao"];
            $documento = $dados["documento"];
            $telefone2 = $dados["telefone2"];
            $renda = $dados["renda"];
            $cliente = $dados["cliente"];
			$cliente = utf8_decode($cliente);			
            $data_nascimento = $dados["data_nascimento"];
            $rg = $dados["rg"];
            $sexo = $dados["sexo"];
            $email = $dados["email"];
			$complemento = $dados["complemento"];
					
		//$dados = "$cidade@$codigo_postal@$sigla@$telefone1@$endereco@$numero@$bairro@$estado_civil@$profissao@$documento@$telefone2@$renda@$cliente@$data_nascimento@$rg@$sexo@$email";

		//echo $dados;
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