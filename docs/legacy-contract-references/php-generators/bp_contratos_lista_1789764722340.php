<?php
/**************************************************
API_DADOS_CONTRATO_TITULAR
API_02	API_DEPENDENTES

NO RETORNO DA API VEM O CAMPO caracteristica_produto QUE INFORMA O TIPO DE CONTRATO
FILTRAR POR CPF QUE ESTÁ COMO documento E POR CARACTERÍSTICA caracteristica_produto

bom_auto
bom_med
bom_pastor - caracteristica_produto: ESSENCIAL, TOTAL +, PÉROLA, RUBI, TOPAZIO, SAFIRA 
bom_pet

48260664	549.987.946-04
50909120	063.362.508-65
51069243	331.955.588-07
48260664	549.987.946-04
50909120	063.362.508-65
51069243	331.955.588-07
51638752	526.073.118-29
48005458	214.034.518-50
48260664	549.987.946-04
50909120	063.362.508-65

acesso.api
w3ssc@2024

jacson
jm@@2024

CONTRATOS CARACTERÍSTICAS
bom_auto
bom_med
bom_pastor - caracteristica_produto: ESSENCIAL, TOTAL +, PÉROLA, RUBI, TOPAZIO, SAFIRA 
bom_pet

**************************************************/
/*
	$curl = curl_init();
	curl_setopt_array($curl, array(
	  CURLOPT_URL => "http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_01?cpf=$cpf",
	  CURLOPT_RETURNTRANSFER => true,
	  CURLOPT_ENCODING => '',
	  CURLOPT_MAXREDIRS => 10,
	  CURLOPT_TIMEOUT => 0,
	  CURLOPT_FOLLOWLOCATION => true,
	  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
	  CURLOPT_CUSTOMREQUEST => 'GET',
	  CURLOPT_HTTPHEADER => array(
		'Authorization: Bearer A6800740-A709-4135-8376-89A0FC284A10',
		'Cookie: JSESSIONID=3699165D45F1E702A86A1441E69EBF85; BOMPASTOR.SID=3699165D45F1E702A86A1441E69EBF85'
	  ),
	));
	$response = curl_exec($curl);
	curl_close($curl);
	echo $response;
	echo "<br><br><br>";
*/

function obterTamanhoArquivoFormatado($caminhoArquivo, $decimais = 2) {
    if (file_exists($caminhoArquivo)) {
        $bytes = filesize($caminhoArquivo);
        //$tamanhos = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
		$tamanhos = array('B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB');
        $fator = floor((strlen($bytes) - 1) / 3);
        return sprintf("%.{$decimais}f", $bytes / pow(1024, $fator)) . ' ' . $tamanhos[$fator];
    } else {
        return 'O arquivo não existe.';
    }
}
?>
<table class="table table-striped">
  <thead class="thead-dark">
    <tr>
      <th scope="col">#</th>
      <th scope="col">Pedido</th>
      <th scope="col">Data</th>
      <th scope="col">Titular</th>
      <th scope="col"></th>
	  <th scope="col"></th>
      <th scope="col"></th>
      <th scope="col"></th>
      <th scope="col"></th>      
    </tr>
  </thead>
  <tbody>
<?php
require_once("../../acess_bompastor/conexao_eligo.php");
require_once("../../acess_bompastor/conexao.php");
require_once("../../acess_bompastor/util.php");
//RECEBE VALORES
$pedido='';
if ($_GET["tipo_contrato"]<>'' and $_GET["cpf"]<>'' and $_GET["pedido"]<>''){
	//echo "tipo: $tipo_contrato - cpf: $cpf - pedido: $pedido<br><br>";
	$tipo_contrato = $_GET["tipo_contrato"];
	$cpf = trim($_GET["cpf"]);//trim remove espaços no início e fim da string
	$pedido = trim($_GET["pedido"]);
	//echo "tipo_contrato: $tipo_contrato - cpf: $cpf<br><br>";
	if($tipo_contrato=='bom_pastor'){
		include("api_bompastor/00_api_pesquisa_assinatura.php");
	}
	if($tipo_contrato=='bom_pet'){
		include("api_bompet/api_bom_pet_pesquisa_titular.php");
	}
	if($tipo_contrato=='bom_med'){
		include("api_bommed/api_bom_med_pesquisa_titular.php");
	}
	if($tipo_contrato=='bom_auto'){
		include("api_bomauto/api_bom_auto_pesquisa_titular.php");
	}
	if($tipo_contrato=='total_mais'){
		include("api_total_mais/api_total_mais_pesquisa_titular.php");
	}
	if($tipo_contrato=='bom_saf'){
		include("api_bomauto/api_safira_pesquisa_titular.php");
	}
	if($tipo_contrato=='bom_pet_saude'){
		include("api_bompet_saude/api_bom_pet_saude_pesquisa_titular.php");
	}
	if($tipo_contrato=='bom_pet_saude_3pets'){
		include("api_bompet_saude_3pets/api_bom_pet_saude_pesquisa_titular.php");
	}
	if($tipo_contrato=='bom_descanso'){
		include("api_bomdescanso/api_descanso_pesquisa_titular.php");
	}
	if($tipo_contrato=='safira'){
		include("api_safira/api_safira_pesquisa_titular.php");
	}
	if($tipo_contrato=='combo_multi_bem_estar'){
		include("api_combo_multi_bem_estar/api_combo_multi_bem_estar_pesquisa_titular.php");
	}
	if($tipo_contrato=='novo_combo_multi_bem_estar'){
		include("api_combo_bem_estar_especial/api_combo_especial_multi_bem_estar_pesquisa_titular.php");
	}
	if($tipo_contrato=='combo_multi_selecao'){
		include("api_combo_selecao/api_combo_selecao_multi_bem_estar_pesquisa_titular.php");
	}
	if($tipo_contrato=='bom_familia'){
		include("api_bomfamilia/api_familia_pesquisa_titular.php");
	}
	if($tipo_contrato=='bom_familia_portabilidade'){
		include("api_bom_familia_portabilidade/api_familia_pesquisa_titular_portabilidade.php");
	}
	if($tipo_contrato=='bom_ideal'){
		include("api_bomideal/api_ideal_pesquisa_titular.php");
	}
	if($tipo_contrato=='convalescenca'){
		include("api_convalescenca/api_pesquisa_assinatura_convalescenca.php");
		//PEGA LINK DO PIX
		$sql_pix = "
		SELECT mensagem_recebida
		FROM mensagens_filas_integracao 
		WHERE mensagem_recebida LIKE '%\"instructions\":\"1234328\"%'";
		$tb_pix = pg_query($conn, $sql_pix);
		$dados_pix = pg_fetch_array($tb_pix);
		$json = $dados_pix["mensagem_recebida"];
		
		// Converte para array associativo
		$data = json_decode($json, true);
		//Link do PIX
		$pix_page = $data['Charge']['Transactions'][0]['Pix']['page'];
	}
	
	if ($titular_nome<>''){
		//DEFINE O NOME DO ARQUIVO DE IMPRESSÃO
		$arquivo_impressao = 'impressao_'.$tipo_contrato;
	
	//echo $arquivo_impressao;
		//VERIFICA SE ARQUIVO DA ASSINATURA EXISTE PARA LIBERAR A GERAÇÃO DO CONTRATO EM PDF
		$assinatura = "../../acess_bompastor/assinaturas/$pedido".'.png';
		//echo "assinatura: $assinatura<br>";
		$desativa_assinatura = 'disabled';
		$desativa_impressao = '';
		if (!file_exists($assinatura)) {
			$desativa_assinatura = '';
			$desativa_impressao = 'disabled';
		}else{
			$tamanho = filesize($assinatura);//bytes
			if ($tamanho>2007){//2007 é o tamanho em bytes sem nada na imagem
				$desativa_assinatura = 'disabled';
				$desativa_impressao = '';
			}else{
				$desativa_assinatura = '';
				$desativa_impressao = 'disabled';
			}
			//echo "tamanho: $tamanho<br>";
		}
		//VERIFICA SE EXISTE ARQUIVO DA FOTO DO DOCUMENTO
		$foto_documento = "../../acess_bompastor/documentos/foto_".$pedido.'.png';
		$desativa_foto = 'disabled';
		if (!file_exists($foto_documento)) {
			$desativa_foto = '';
		}else{
			$tamanho = filesize($foto_documento);//bytes
			//echo "tamanho $tamanho<br>";
			if ($tamanho>2007){//2007 é o tamanho em bytes sem nada na imagem
				$desativa_foto = 'disabled';
			}else{
				$desativa_foto = '';
			}
		}
		//CODIFICA PEDIDO E CPF
		$pedido_codificado = base64_encode(base64_encode(strrev(base64_encode($pedido))));
		$cpf_codificado = base64_encode(base64_encode(strrev(base64_encode($cpf))));
		?>
		<tr>
		  <th scope="row">1</th>
		  <td><?php echo $pedido;?></td>
		  <td><?php echo Mostra_data($data_emissao);?></td>
		  <td><?php echo $titular_nome;?></td>
		  <th scope="col">
			<!-- Modal -->
			<button type="button" class="btn btn-success" onClick="AbrirAreaAssinatura('<?php echo $pedido_codificado;?>')" <?php echo $desativa_assinatura;?>>Assinar</button>
		  </th>
		  <th scope="col">
			<?php
            if ($desativa_assinatura=='disabled'){
				$desativa_assinatura_refazer = '';
			}else{
				$desativa_assinatura_refazer = 'disabled';
			}
			?>
			<!-- Modal -->
			<button type="button" class="btn btn-success" onClick="AbrirAreaAssinatura('<?php echo $pedido_codificado;?>')" <?php echo $desativa_assinatura_refazer;?>>Refazer Assinatura</button>
		  </th>
		  <th scope="col">
			<!-- Modal -->
			<button type="button" class="btn btn-success" onClick="AbrirAreaFoto('<?php echo $pedido_codificado;?>')" <?php echo $desativa_foto;?>>Foto Documento</button>
		  </th>
		  <th scope="col"><button type="button" class="btn btn-primary" onClick="javascript:window.open('<?php echo $arquivo_impressao;?>.php?gfFffsAuLJgYrdtHGFfgFjJHfkGhKhuGDRei=<?php echo $cpf_codificado;?>&skdfeioHHHksdjskJJ=<?php echo $pedido_codificado;?>');" <?php echo $desativa_impressao;?>>Gerar PDF</button></th>

<?php
if($tipo_contrato<>'convalescenca'){
?>
		  <th scope="col"><button type="button" class="btn btn-info" onClick="MostraTelaEnvio('<?php echo $cpf_codificado;?>', '<?php echo $pedido_codificado;?>', '<?php echo $titular_nome;?>', '<?php echo $tipo_contrato;?>');" <?php echo $desativa_impressao;?>>Enviar WhatsApp</button></th>
<?php
}else{
?>
		  <th scope="col"><button type="button" class="btn btn-info" onClick="MostraTelaEnvioConvalescenca('<?php echo $cpf_codificado;?>', '<?php echo $pedido_codificado;?>', '<?php echo $titular_nome;?>', '<?php echo $tipo_contrato;?>', '<?php echo $pix_page;?>');" <?php echo $desativa_impressao;?>>Enviar WhatsApp</button></th>
<?php
}
?>
		</tr>
		</tbody>
	</table>
<?php
	}else{
		echo "Sem Contrato para o CPF pesquisado!";	
	}
}
?>