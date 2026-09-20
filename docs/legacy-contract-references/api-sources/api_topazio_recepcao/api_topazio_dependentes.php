<?php
//INVERTE DATA
//$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf='761.499.786-72';
//$data_nascimento = '1951-12-04';


//echo "dados_pesquisa: $dados_pesquisa<br>";


/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_TOPAZIO_DEPENDENTES?documento=$cpf&pedido=$pedido",
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
	
	$dep_preco = '';
	$dep_telefone = '';
	$dep_data_nascimento = '';
	$dep_nome_pessoa = '';
	$dep_cpf = '';
	$dep_pedido = '';
	$dep_sexo = '';
	$dep_preco = '';
	$tot_dep = '';
	$parentesco = '';
	$total_dep =0;
	$cont = 1;
	$filhos_tem=0;
	$conjute_tem=0;
	$conjuge_data_nascimento = '';
	$conjuge_nome_pessoa = '';
	$conjuge_sexo = '';
	$conjuge_parentesco = '';
	$conjuge_preco = '';
	
	$filhos = array();
	foreach ($response as $chave => $valor){
		//echo "<strong>Dependente: $cont</strong><br>";
		foreach ($valor as $chave_um => $valor_um){
			if ($chave_um=='preco'){$dep_preco = $valor_um;}
			if ($chave_um=='telefone'){$dep_telefone = $valor_um;}
			if ($chave_um=='data_nascimento'){$dep_data_nascimento = $valor_um;}
			if ($chave_um=='nome_pessoa'){$dep_nome_pessoa = $valor_um;}
			if ($chave_um=='cpf_dependente'){$dep_cpf = $valor_um;}		
			if ($chave_um=='pedido'){$dep_pedido = $valor_um;}
			if ($chave_um=='sexo'){$dep_sexo = $valor_um;}
			if ($chave_um=='parentesco'){$dep_parentesco = $valor_um;}
		}
		/*
		echo "
		nome_pessoa: $dep_nome_pessoa<br>
		sexo: $dep_sexo<br>
		parentesco: $dep_parentesco<br>
		";
		*/
		if ($dep_preco>1){
			$total_dep = $total_dep + $dep_preco;
		}
		if ($dep_parentesco=='Filho/Filha'){
			$filhos_tem=1;
			$filhos[] = array($dep_preco, $dep_data_nascimento, $dep_nome_pessoa, $dep_sexo, $dep_parentesco);
		}
		if ($dep_parentesco=='Cônjuge'){
			$conjuge_tem=1;
			$conjuge_data_nascimento = $dep_data_nascimento;
			$conjuge_nome_pessoa = $dep_nome_pessoa;
			$conjuge_sexo = $dep_sexo;
			$conjuge_parentesco = $dep_parentesco;
			$conjuge_preco = $dep_preco;
		}
		$cont++;
	}
	// Extraindo a primeira coluna
	$coluna = array_column($filhos, 0);
	
	// Ordenando pelo primeiro item de cada subarray
	array_multisort($coluna, SORT_ASC, $filhos);
	
	// Imprimindo o resultado
	//print_r($dependentes);	
}else{
	echo "Sem dependentes!";
}
?>