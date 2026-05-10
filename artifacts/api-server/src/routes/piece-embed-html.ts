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
    return res.send(pieceEmbedHtml(piece.title, version.engine, version.generatedCode, version.htmlCode, version.cssCode));
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

function pieceEmbedHtml(title: string, engine: string, code: string, htmlCode: string | null | undefined, cssCode: string | null | undefined): string {
  const safeTitle = escapeHtml(title);
  const safeCode = JSON.stringify(code);
  const safeCss = cssCode || "";
  const safeHtml = htmlCode || "";

  const robustEval = `
    const code = ${safeCode};
    const captured = {};
    const mockWindow = new Proxy(window, {
      get(target, prop) {
        if (prop === "sketch") return captured.sketch;
        if (Object.prototype.hasOwnProperty.call(captured, prop)) return captured[prop];
        const val = target[prop];
        if (typeof val === "function") return val.bind(target);
        return val;
      },
      set(target, prop, value) {
        if (prop === "sketch") {
          captured.sketch = value;
          return true;
        }
        captured[prop] = value;
        return true;
      },
      has(target, prop) {
        return prop === "sketch" || prop in captured || prop in target;
      }
    });

    let sketchFactory = null;
    try {
      new Function("window", "self", "top", code)(mockWindow, mockWindow, mockWindow);
      sketchFactory = captured.sketch;
    } catch (err) {}

    if (!sketchFactory || typeof sketchFactory !== 'function') {
      try {
        // Wrap in parentheses but handle line comments by adding a newline
        sketchFactory = new Function("return (" + code + "\\n)")();
      } catch (err) {}
    }
    window.sketch = sketchFactory;
  `;

  if (htmlCode !== null && htmlCode !== undefined) {
    const importMap = engine === "three" ? `<script type="importmap">
  {
    "imports": {
      "three": "/runtimes/three.module.min.js"
    }
  }
</script>` : "";

    const scripts = engine === "three" 
      ? `<script type="module">
import * as THREE from '/runtimes/three.module.min.js';
window.THREE = THREE;
${robustEval}
try {
  if (typeof window.sketch === 'function') {
    let frameId = 0;
    function startFrame(handler) {
      let frameCount = 0;
      function tick() { frameCount++; handler(frameCount); frameId = requestAnimationFrame(tick); }
      frameId = requestAnimationFrame(tick);
    }
    const canvas = document.querySelector('canvas') || document.createElement('canvas');
    if (!canvas.parentNode) document.body.appendChild(canvas);
    const cleanup = window.sketch({ THREE, canvas, startFrame });
  }
} catch (err) {
  document.body.innerHTML += '<p style="font-family:sans-serif;color:#c00;padding:1rem">Sketch error: ' + err.message + '</p>';
}
</script>`
      : engine === "c2"
      ? `<script src="/runtimes/c2.min.js"></script>
<script>
${robustEval}
try {
  if (typeof window.sketch === 'function') {
    let frameId = 0;
    function startFrame(handler) {
      let frameCount = 0;
      function tick() { frameCount++; handler(frameCount); frameId = requestAnimationFrame(tick); }
      frameId = requestAnimationFrame(tick);
    }
    const canvas = document.querySelector('canvas') || document.createElement('canvas');
    if (!canvas.parentNode) document.body.appendChild(canvas);
    window.sketch({ c2: window.c2, canvas, startFrame });
  }
} catch (err) {
  document.body.innerHTML += '<p style="font-family:sans-serif;color:#c00;padding:1rem">Sketch error: ' + err.message + '</p>';
}
</script>`
      : `<script src="/runtimes/p5.min.js"></script>
<script>
${robustEval}
try {
  if (typeof window.sketch === 'function') {
    new p5(function(p) { window.sketch(p); }, document.body);
  }
} catch (err) {
  document.body.innerHTML += '<p style="font-family:sans-serif;color:#c00;padding:1rem">Sketch error: ' + err.message + '</p>';
}
</script>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  ${importMap}
  <style>
${safeCss}
  </style>
</head>
<body>
${safeHtml}
${scripts}
</body>
</html>`;
  }

  // Backwards compatibility for pieces without explicit htmlCode/cssCode
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
window.THREE = THREE;
${robustEval}
(function(){
  var canvas=document.getElementById('piece-canvas');
  try{
    if (typeof window.sketch === 'function') {
      var frameId=0;
      function startFrame(handler){
        var frameCount=0;
        function tick(){frameCount++;handler(frameCount);frameId=requestAnimationFrame(tick);}
        frameId=requestAnimationFrame(tick);
      }
      window.sketch({THREE:THREE,canvas:canvas,startFrame:startFrame});
    }
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
${robustEval}
(function(){
  var canvas=document.getElementById('piece-canvas');
  try{
    if (typeof window.sketch === 'function') {
      var frameId=0;
      function startFrame(handler){
        var frameCount=0;
        function tick(){frameCount++;handler(frameCount);frameId=requestAnimationFrame(tick);}
        frameId=requestAnimationFrame(tick);
      }
      window.sketch({c2:window.c2,canvas:canvas,startFrame:startFrame});
    }
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
${robustEval}
(function(){
  var container=document.getElementById('canvas-container');
  try{
    if (typeof window.sketch === 'function') {
      new p5(function(p){ window.sketch(p); },container);
    }
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
