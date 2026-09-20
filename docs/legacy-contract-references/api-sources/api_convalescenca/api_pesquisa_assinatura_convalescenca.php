<?php
//PESQUISA DE CONTRATOS
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BP_MULTI/api/API_PESQUISA_ASSINATURA_CONVALESCENCA?documento=$cpf&contato=$pedido",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'GET',
  CURLOPT_HTTPHEADER => array(
	"documento: $cpf",
	'Authorization: Bearer A6800740-A709-4135-8376-89A0FC284A10',
	'Cookie: JSESSIONID=2F56EEE17E65985AEA4E3FF73846ED66; BOMPASTOR.SID=3699165D45F1E702A86A1441E69EBF85'
  ),
));
$response = curl_exec($curl);
curl_close($curl);

/*echo "<strong>response:</strong><br>";
echo $response;
echo "<br><br>";
*/
$response = json_decode($response, true);
/*
echo "<pre>";
echo print_r($response);
echo "</pre>";
exit;
*/
if ($response<>''){
    $local='';
    $cliente='';
    $pergunta_1='';
    $resposta_1='';
    $pergunta_2='';
    $resposta_2='';
    $pergunta_3='';
    $resposta_3='';
    $pergunta_4='';
    $resposta_4='';
    $pergunta_5='';
    $resposta_5='';
    $pergunta_6='';
    $resposta_6='';
    $pergunta_7='';
    $resposta_7='';
    $pergunta_8='';
    $resposta_8='';

    $contato='';
    $acao='';
    $tipo_contato='';

	foreach ($response as $dados){
		$pedido = $dados["contato"];
		$documento = $dados["documento"];
		$local = $dados["local"];
		$titular_nome = utf8_decode($dados["cliente"]);
		
		$pergunta_1=$dados["pergunta_1"]; //Qual a data de Retirada do Equipamento?
		$data_retirada=$dados["resposta_1"];

		$pergunta_2 = $dados["pergunta_2"]; //Qual o material está sendo retirado?
		$tipo_equipamento = $dados["resposta_2"];
		//Materiais estão separados por vírgula. Fazer um explode para saber quantos tem
		$lista_equipamentos = explode(',', $tipo_equipamento);
		$qtde_equipamentos = count($lista_equipamentos);

		$pergunta_3 = $dados["pergunta_3"]; //Houve algum custo para este aluguel? Qual?
		$valor_custo = $dados["resposta_3"];

		$pergunta_4 = $dados["pergunta_4"]; //Qual a data Prevista para devolução?
		$data_devolucao_prevista = @$dados["resposta_4"];

		$pergunta_5=$dados["pergunta_5"]; //Qual foi a data de devolução? (Responder somente na devolução)
		$data_devolucao=$dados["resposta_5"];

		$pergunta_6 = $dados["pergunta_6"]; //Locatário
		$locatario = $dados["resposta_6"];
		if ($locatario==''){$locatario = 'Não informado';}
		$locatario = utf8_decode($locatario);

		//$pergunta_7=$dados["pergunta_7"];  É apenas uma divisão de tela

		$pergunta_8 = $dados["pergunta_8"];//Gerar Pix
		$resposta_8 = $dados["resposta_8"];

		$acao=$dados["acao"];
		$tipo_contato=$dados["tipo_contato"];

	}
}
//------------------------------------------------
?>