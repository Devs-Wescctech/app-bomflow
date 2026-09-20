<?php
//INVERTE DATA
//$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf='038.575.888-02';
//$data_nascimento = '1951-12-04';


//echo "dados_pesquisa: $dados_pesquisa<br>";


/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_BOM_AUTO_DADOS_CARRO?documento=$cpf&pedido=$pedido",
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
exit;
*/

if ($response<>''){

	$carro_ano ='';
	$carro_cor = '';
    $carro_veiculo = '';
    $carro_placa = '';
	$dep_cpf = '';
	$dep_telefone = '';
	$dep_sexo = '';
	$carro_temp='';
	$cpf_condutor='';

	$cont = 1;
	$carros = array();
	foreach ($response as $chave => $valor){
		//echo "<strong>Dependente: $cont</strong><br>";
		foreach ($valor as $chave_um => $valor_um){
			if ($chave_um=='fabricacao'){$carro_ano = $valor_um;}
			if ($chave_um=='cor'){$carro_cor = $valor_um;}
			if ($chave_um=='veiculo'){$carro_veiculo = $valor_um;}		
			if ($chave_um=='placa'){$carro_placa = $valor_um;}
			if ($chave_um=='modelo'){$carro_modelo = $valor_um;}
			if ($chave_um=='cpf'){$dep_cpf = $valor_um;}
			if ($chave_um=='telefone'){$dep_telefone = $valor_um;}
			if ($chave_um=='sexo'){$dep_sexo = $valor_um;}
			if ($chave_um=='data_nascimento'){$carro_ano = $valor_um;}
			if ($chave_um=='cpf_condutor'){$cpf_condutor = $valor_um;}
		}
		
		/*ELEGIBILIDADE DE CLIENTE BOM PET*/
		$execucao = curl_init();
		curl_setopt_array($execucao, array(
		  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_NOME_CONDUTOR_BOM_AUTO?documento=$cpf_condutor",
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
		$retorno = curl_exec($execucao);
		curl_close($execucao);
		
		/*echo "<strong>response:</strong><br>";
		echo $response;
		echo "<br><br>";
		*/
		$retorno = json_decode($retorno, true);
		/*echo "<pre>";
		echo print_r($response);
		echo "</pre>";
		*/
		//exit;
		
		if ($retorno<>''){
			foreach($retorno as $retorno){
				$nome_condutor = $retorno["nome_completo"];	
				$estado_civil_condutor = $retorno["estado_civil"];	
			}
			
		}
			$carro_temp = substr($carro_ano, 0, 4);
			$carro_ano = $carro_temp;
			$carros[] = array($carro_ano, $carro_cor, $carro_veiculo, $carro_placa, $carro_modelo, $dep_cpf, $dep_telefone, $dep_sexo, $cpf_condutor, $nome_condutor, $estado_civil_condutor);
			$cont++;
	}
	// Extraindo a primeira coluna
	//$coluna = array_column($dependentes, 0);
	
	// Ordenando pelo primeiro item de cada subarray
	//array_multisort($coluna, SORT_ASC, $dependentes);
	
	// Imprimindo o resultado
	//print_r($dependentes);	
}else{
	echo "Sem dependentes!";
}
?>