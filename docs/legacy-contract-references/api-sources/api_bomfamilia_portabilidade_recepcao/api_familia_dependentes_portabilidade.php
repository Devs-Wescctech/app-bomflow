<?php
//INVERTE DATA
//$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf='761.499.786-72';
//$data_nascimento = '1951-12-04';


//echo "dados_pesquisa: $dados_pesquisa<br>";


/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_FAMILIA_DEPENDENTES_PORT?documento=$cpf&pedido=$pedido",
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
	$dep_telefone = '';
	$dep_descricao_plano='';
	$total_dep =0;
	$cont = 1;
	$filhos_tem=0;
	$dependentes_tem=0;
	$parentes_tem=0;
	$cont_max_dep=0;
	$dep_bom_med_tem=0;				
	$dependentes = array();
	$parentes = array();
	$filhos = array();
	$valor_bom_med=0;
	$tem_bm=0;
	$existe='';
	$chave=0;
	$bom_med=array();
	$filhos_bm=array();
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
			if ($chave_um=='descricao'){$dep_descricao_plano = $valor_um;}
			if ($chave_um=='parentesco'){$dep_parentesco = $valor_um;}
			if ($chave_um=='documento'){$titular_cpf = $valor_um;}
		}
	
		/*echo "
		cor1: $cor1<br>
		cor2: $cor2<br>
		raca: $raca<br>
		nome: $nome<br>
		";
		*/
		if($dep_cpf<>$titular_cpf){
			if ($dep_preco>1){
				$total_dep = $total_dep + $dep_preco;
			}
	//echo "<strong>$dep_nome_pessoa</strong> - dep_descricao_plano: $dep_descricao_plano<br>";
			if ($dep_descricao_plano=='BOM MED - DEPENDENTE 0,00'){
				//echo "bom Med: $dep_nome_pessoa<br>";
				$dep_bom_med_tem=1;
				$valor_bom_med=$valor_bom_med + $dep_preco;
				$bom_med[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco);
				$tem_bm=1;			
				if ($dep_parentesco=='Filho/Filha' and in_array($dep_nome_pessoa, $filhos)==false){
	//echo "$dep_parentesco=='Filho/Filha' and ".in_array($dep_nome_pessoa, $filhos)."==false<br><br>";
					$filhos_tem=1;
					$filhos_bm[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco, $tem_bm);
				}
/*				if (($dep_parentesco=='Dependente' or $dep_parentesco=='Não informado') and $cont_max_dep<2){
	//echo "($dep_parentesco=='Dependente' or $dep_parentesco=='Não informado') and $cont_max_dep<2<br><br>";
					$cont_max_dep+=1;
					$dependentes_tem=1;
					$dependentes[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco, $tem_bm);
				}
		*/
				if ($dep_parentesco<>'Filho/Filha' and $dep_parentesco<>'Dependente' and $dep_parentesco<>'Não informado'){
	//echo "$dep_parentesco<>'Filho/Filha' and $dep_parentesco<>'Dependente' and $dep_parentesco<>'Não informado'<br><br>";
					$parentes_tem=1;			
					$parentes[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco, $tem_bm);
				}
			}else{
	//echo "<font color='#FF0000'>NÃO É BOM MED - DEPENDENTE 0,00</font><br>";
				//$chave=array_search($dep_nome_pessoa, $bom_med);
				//echo "$chave<br>";
				//if(in_array($dep_nome_pessoa, $bom_med)){
	
	
	//echo "<pre>";
	//echo print_r($bom_med);
	//echo "</pre>";
	
	$pesquisa = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco);
	
				if(in_array($pesquisa, $bom_med)==false){
	//echo "NÃO ESTÁ NO ARRAY <strong>bom_med</strong><br><br>";
				 //echo "total +: $dep_nome_pessoa<br>";
					$tem_bm=0;	
					if ($dep_parentesco=='Filho/Filha' and in_array($dep_nome_pessoa, $filhos)==false){
						$filhos_tem=1;
						$filhos[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco, $tem_bm);
					}
					if (($dep_parentesco=='Dependente' or $dep_parentesco=='Não informado') and $cont_max_dep<2){
						$cont_max_dep+=1;
						$dependentes_tem=1;
						$dependentes[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco, $tem_bm);
					}
					if ($dep_parentesco<>'Filho/Filha' and $dep_parentesco<>'Dependente' and $dep_parentesco<>'Não informado'){
						$parentes_tem=1;			
						$parentes[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco, $tem_bm);
					}
				}else{
	//echo "ESTÁ NO ARRAY <strong>bom_med</strong><br><br>";
				}
			}
			
			
			
			
			
			/*
			if ($dep_descricao_plano=='BOM MED - DEPENDENTE 0,00'){
				$dep_bom_med_tem=1;
				$valor_bom_med=$valor_bom_med + $dep_preco;
				$bom_med[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco);
				$tem_bm=1;			
			}else{$tem_bm=0;}
			if ($dep_parentesco=='Filho/Filha' and in_array($dep_nome_pessoa, $filhos)==false){
				$filhos_tem=1;
				$filhos[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco, $tem_bm);
			}
			if (($dep_parentesco=='Dependente' or $dep_parentesco=='Não informado') and $cont_max_dep<2){
				$cont_max_dep+=1;
				$dependentes_tem=1;
				$dependentes[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco, $tem_bm);
			}
			if ($dep_parentesco<>'Filho/Filha' and $dep_parentesco<>'Dependente' and $dep_parentesco<>'Não informado'){
				$parentes_tem=1;			
				$parentes[] = array($dep_preco, $dep_telefone, $dep_data_nascimento, $dep_nome_pessoa, $dep_cpf, $dep_pedido, $dep_sexo, $dep_parentesco, $tem_bm);
			}*/
		
			}
		$cont++;
	}
	// Extraindo a primeira coluna
	$coluna = array_column($dependentes, 0);
	
	// Ordenando pelo primeiro item de cada subarray
	array_multisort($coluna, SORT_ASC, $dependentes);
	
	// Imprimindo o resultado
	//print_r($dependentes);	
}else{
	echo "Sem dependentes!";
}
?>