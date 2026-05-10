import { Router, type Request, type Response } from "express";
import { artPiecesTable, artPieceVersionsTable, db, eq } from "@workspace/db";
import { z } from "zod/v4";

const router = Router();

const PieceIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

const PieceEmbedQuery = z.object({
  version: z.coerce.number().int().positive().optional(),
});

router.get("/embed/pieces/:id", async (req: Request, res: Response) => {
  const params = PieceIdParams.safeParse(req.params);
  const query = PieceEmbedQuery.safeParse(req.query);
  if (!params.success || !query.success) {
    return res.status(404).send(notFoundHtml());
  }

  try {
    const pieceRows = await db
      .select()
      .from(artPiecesTable)
      .where(eq(artPiecesTable.id, params.data.id))
      .limit(1);
    const piece = pieceRows[0] ?? null;
    if (!piece) {
      return res.status(404).send(notFoundHtml());
    }

    const versionId = query.data.version ?? piece.currentVersionId;
    if (!versionId) {
      return res.status(404).send(notFoundHtml());
    }

    const versionRows = await db
      .select()
      .from(artPieceVersionsTable)
      .where(eq(artPieceVersionsTable.id, versionId))
      .limit(1);
    const version = versionRows[0] ?? null;
    if (!version || version.artPieceId !== piece.id) {
      return res.status(404).send(notFoundHtml());
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(pieceEmbedHtml(piece.title, version.engine, version.generatedCode));
  } catch (err) {
    console.error("Failed to serve piece embed:", err);
    return res.status(500).send(notFoundHtml());
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pieceEmbedHtml(title: string, engine: string, code: string): string {
  const safeTitle = escapeHtml(title);
  const safeCode = JSON.stringify(code);

  if (engine === "three") {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>html,body{margin:0;padding:0;overflow:hidden;background:#000}canvas{display:block}</style>
</head>
<body>
<canvas id="piece-canvas"></canvas>
<script type="module">
import * as THREE from '/runtimes/three.module.min.js';
(function(){
  var canvas=document.getElementById('piece-canvas');
  var code=${safeCode};
  try{
    var runner=new Function('return('+code+')')();
    var frameId=0;
    function startFrame(handler){
      var frameCount=0;
      function tick(){frameCount++;handler(frameCount);frameId=requestAnimationFrame(tick);}
      frameId=requestAnimationFrame(tick);
    }
    runner({THREE:THREE,canvas:canvas,startFrame:startFrame});
  }catch(err){
    document.body.innerHTML='<p style="font-family:sans-serif;color:#c00;padding:1rem">Sketch error: '+err.message+'</p>';
  }
})();
</script>
</body>
</html>`;
  }

  if (engine === "c2") {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>html,body{margin:0;padding:0;overflow:hidden;background:#fff}canvas{display:block}</style>
</head>
<body>
<canvas id="piece-canvas"></canvas>
<script src="/runtimes/c2.min.js"></script>
<script>
(function(){
  var canvas=document.getElementById('piece-canvas');
  var code=${safeCode};
  try{
    var runner=new Function('return('+code+')')();
    var frameId=0;
    function startFrame(handler){
      var frameCount=0;
      function tick(){frameCount++;handler(frameCount);frameId=requestAnimationFrame(tick);}
      frameId=requestAnimationFrame(tick);
    }
    runner({c2:window.c2,canvas:canvas,startFrame:startFrame});
  }catch(err){
    document.body.innerHTML='<p style="font-family:sans-serif;color:#c00;padding:1rem">Sketch error: '+err.message+'</p>';
  }
})();
</script>
</body>
</html>`;
  }

  // Default: p5
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>html,body{margin:0;padding:0;overflow:hidden;background:#fff}canvas{display:block}</style>
</head>
<body>
<div id="canvas-container"></div>
<script src="/runtimes/p5.min.js"></script>
<script>
(function(){
  var code=${safeCode};
  var container=document.getElementById('canvas-container');
  try{
    var f=new Function('return('+code+')')();
    new p5(function(p){f(p);},container);
  }catch(err){
    document.body.innerHTML='<p style="font-family:sans-serif;color:#c00;padding:1rem">Sketch error: '+err.message+'</p>';
  }
})();
</script>
</body>
</html>`;
}

function notFoundHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Not found</title>
  <style>html,body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;color:#666;background:#fafafa}</style>
</head>
<body>
<p>Interactive piece not found.</p>
</body>
</html>`;
}

export default router;
