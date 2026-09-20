<?php
require_once("../../acess_bompastor/conexao.php");
//header('Content-Type: text/html; charset=utf-8');
//header('Content-Type: text/html; charset=ISO-8859-1');
//require_once("../../acess_bompastor/conexao.php");
//require_once("../../acess_bompastor/controle_acesso.php");
//require_once("../../acess_bompastor/data.php");
//require_once("../../acess_bompastor/util.php");

//Recebe dados
if (@$_GET["cpf"]<>''){
	$cliente = $_GET["cliente"];
	$cpf_codificado = $_GET["cpf"];
	$pedido_codificado = $_GET["pedido"];
	$tipo_contrato = $_GET["tipo_contrato"];
	//decodifica
	$cpf = base64_decode(strrev(base64_decode(base64_decode($cpf_codificado))));
	$pedido = base64_decode(strrev(base64_decode(base64_decode($pedido_codificado))));
}else{
	exit;
}
?>
<div class="container bg-white text-left">
	<h3>Envio do Link p/Assinatura do Contrato pelo WhatsApp</h3>
	<form name="form" method="post" enctype="multipart/form-data">
		<div class="form-row">
			<div class="form-group col-md-6">
				<label for="whatsapp_cliente_ass" class="form-label">WhatsApp Cliente</label>
				<div class="input-group mb-3">
                	<span class="input-group-text">+55</span>
                	<input type="text" class="form-control" id="whatsapp_codigo_area_ass" name="whatsapp_codigo_area_ass" maxlength="2" placeholder="Código de Área" style="width:30px;" required>
                	<input type="text" class="form-control" id="whatsapp_telefone_ass" name="whatsapp_telefone_ass" maxlength="9" placeholder="Telefone somente números" required>
				</div>
			</div>
		</div>
		<div class="form-row">
			<div class="form-group col-md-6">
				<!-- MENSAGEM ERRO -->
				<div id="EnvioContratoRetornoAssinatura" class="alert alert-primary" role="alert" style="display:none;"></div>
			</div>
		</div>
        <div class="form-row">
			<div class="form-group col-md-2">
				<button type="button" class="btn btn-primary" style="width:120px;" onClick="EnviarContratoWhatsappAssinatura('<?php echo $cpf;?>', '<?php echo $pedido;?>', '<?php echo $cliente;?>', '<?php echo $tipo_contrato;?>')">Enviar</button>
			</div>
			<div class="form-group col-md-2">
				<button type="button" class="btn btn-secondary" style="width:120px;" onClick="FecharTelaEnvioAssinatura()">Fechar</button>
			</div>
		</div>
	</form>
</div>