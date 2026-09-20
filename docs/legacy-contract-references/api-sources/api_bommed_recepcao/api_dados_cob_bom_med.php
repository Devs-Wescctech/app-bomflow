<?php
//INVERTE DATA
//$data_nascimento = substr($data_nascimento, 6, 4).'-'.substr($data_nascimento, 3, 2).'-'.substr($data_nascimento, 0, 2);

//$cpf='761.499.786-72';
//$data_nascimento = '1951-12-04';


//echo "dados_pesquisa: $dados_pesquisa<br>";

/*ELEGIBILIDADE DE CLIENTE BOM PET*/
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_DADOS_COB_BOM_MED?documento=$cpf&pedido=$pedido",
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
	$qtd = '';
	$plano_pagamento = '';
	$pedido = '';
	$documento = '';
	$adesao = '';
	$total_valor = '';
	$cob_total_valor=0;
	$cont = 1;
	$cob_plano_pagamento='';
	$cob_pedido='';
	$vencimento='';
	$cobrancas = array();
	foreach ($response as $chave => $valor){
		//echo "<strong>Dependente: $cont</strong><br>";
		foreach ($valor as $chave_um => $valor_um){
			if ($chave_um=='qtd'){$qtd = $valor_um;}
			if ($chave_um=='plano_pagamento'){$plano_pagamento = $valor_um;}
			if ($chave_um=='pedido'){$pedido_cob = $valor_um;}
			if ($chave_um=='documento'){$documento = $valor_um;}
			if ($chave_um=='adesao'){$adesao = $valor_um;}
			if ($chave_um=='total_valor'){$total_valor = $valor_um;}
			if ($chave_um=='dia_vencimento'){$vencimento = $valor_um;}
		}
	
		/*echo "
		qtd: $qtd<br>
		plano_pagamento: $plano_pagamento<br>
		pedido: $pedido<br>
		adesao: $adesao<br>
		total_valor: $total_valor<br>
		";
		*/
		if ($pedido=$pedido_cob){
			if ($total_valor>3){
				$cob_plano_pagamento = $plano_pagamento;
				$cob_pedido = $pedido;
				$cob_adesao = $adesao;
				$cob_total_valor =$cob_total_valor + $total_valor;
				$vencimento = $vencimento;
			}else{
				$vencimento = $vencimento;
				$cob_plano_pagamento = $plano_pagamento;
				$cob_pedido = $pedido;
				$cob_adesao = $adesao;
				$cob_total_valor = $cob_total_valor;	
			}
			//echo "total valor: $cob_total_valor<br>";
		}
		$cont++;
	}
	if($cob_total_valor==''){$cob_total_valor=0;}
}else{
	echo "Sem dependentes!";
}
?>