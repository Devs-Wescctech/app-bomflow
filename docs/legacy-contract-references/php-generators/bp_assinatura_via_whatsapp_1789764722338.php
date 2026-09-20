<?php
if (@$_GET["gYrdtHjhgfFffsAuLJKhuGGFfgFDReiJHfkG"]<>''){
	$contrato_numero = $_GET["gYrdtHjhgfFffsAuLJKhuGGFfgFDReiJHfkG"];
	//decodifica
	$contrato_numero = base64_decode(strrev(base64_decode(base64_decode($contrato_numero))));
}else{
	exit;
}
?>
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
	<!-- Icone -->
	<link rel="shortcut icon" href="imagens/favicon.png" type="image/x-icon">

    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
    <title>Assinatura Digital</title>
</head>
<body>

<form method="post" enctype="multipart/form-data">
<div class="container">
    <h2 class="mt-5">Assinatura Digital</h2>
	<div class="row">
	    <div class="col-md-1" style="padding-top:30px;"><img src="imagens/favicon.png" width="60"></div>
        <div class="col-md-5"><h2 class="mt-5">Assinatura Digital</h2></div>
    </div>

    <canvas id="signatureCanvas" width="450" height="200" style="border:1px solid #000; background-image:url(imagens/bkg_assinatura.jpg)"></canvas>
    <script>
        
		// Adiciona a linha de referência no canvas
        var canvas = document.getElementById("signatureCanvas");
        var ctx = canvas.getContext("2d");
/*
        // Desenha a linha horizontal no meio do campo
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.closePath();
*/
        // Adiciona suporte a eventos de toque
        var drawing = false;

        canvas.addEventListener("mousedown", startDrawing);
        canvas.addEventListener("touchstart", startDrawingTouch);

        canvas.addEventListener("mousemove", draw);
        canvas.addEventListener("touchmove", drawTouch);

        canvas.addEventListener("mouseup", stopDrawing);
        canvas.addEventListener("touchend", stopDrawing);

        function getTouchPos(canvasDom, touchEvent) {
            var rect = canvasDom.getBoundingClientRect();
            return {
                x: touchEvent.touches[0].clientX - rect.left,
                y: touchEvent.touches[0].clientY - rect.top
            };
        }

        function startDrawing(e) {
            drawing = true;
            draw(e);
        }

        function startDrawingTouch(e) {
            drawing = true;
            var touchPos = getTouchPos(canvas, e);
            ctx.moveTo(touchPos.x, touchPos.y);
            drawTouch(e);
        }

        function draw(e) {
            if (!drawing) return;

            var pos = getMousePos(canvas, e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            ctx.moveTo(pos.x, pos.y);
        }

        function drawTouch(e) {
            if (!drawing) return;

            var touchPos = getTouchPos(canvas, e);
            ctx.lineTo(touchPos.x, touchPos.y);
            ctx.stroke();
            ctx.moveTo(touchPos.x, touchPos.y);
        }

        function stopDrawing() {
            drawing = false;
            ctx.beginPath();
        }

        function getMousePos(canvasDom, mouseEvent) {
            var rect = canvasDom.getBoundingClientRect();
            return {
                x: mouseEvent.clientX - rect.left,
                y: mouseEvent.clientY - rect.top
            };
        }
    </script>

    <div class="row">
    	<div class="col-sm-3">
		    <button class="btn btn-primary mt-3 btn-lg" onclick="saveSignature('<?php echo $contrato_numero;?>')">Salvar</button>
    	</div>
        <div class="col-sm-3">
            <button type="button" class="btn btn-warning mt-3 btn-lg" onclick="clearCanvas()">Limpar</button>

		</div>
    	<div class="col-sm-3">
		    <button class="btn btn-secondary mt-3 btn-lg" onclick="javascript:window.close();">Fechar</button>
    	</div>
    </div>
</div>
</form>

<script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.1/js/all.min.js"></script>
<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"></script>
<script src="js/app.js"></script>

</body>
</html>
