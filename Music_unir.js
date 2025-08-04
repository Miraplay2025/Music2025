const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const keyFile = path.join(os.homedir(), '.config', 'rclone', 'rclone.conf');
const input = JSON.parse(fs.readFileSync('input.json', 'utf-8'));

console.log('🔗 Stream URL:', input.stream_url);
console.log('📄 Arquivos raw:', input.arquivos);

// Executa FFmpeg com args
function executarFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: 'inherit' });
    ffmpeg.on('close', code => {
      if (code !== 0) reject(new Error(`Erro no FFmpeg (código ${code})`));
      else resolve();
    });
  });
}

// Garante que pastas existam
function garantirPasta(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Reencoda vídeo para 720p @ 60fps
async function reencodeVideo(input, output) {
  console.log(`🔄 Reencodando ${input} → ${output}`);
  await executarFFmpeg([
    '-i', input,
    '-vf', 'scale=1280:720,fps=60',
    '-r', '60',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    output
  ]);
}

// Sobrepõe imagem como rodapé centralizado (largura 1235px)
async function sobreporImagem(videoPath, imagemPath, destino) {
  console.log(`🖼️ Sobrepondo imagem ${imagemPath} sobre ${videoPath}`);
  
  const enableOverlay = 'between(t,0,9999)'; // sempre visível (ou personalize)

  await executarFFmpeg([
    '-i', videoPath,
    '-i', imagemPath,
    '-filter_complex',
    `[1:v]scale=1235:-1[rodape];[0:v]setpts=PTS-STARTPTS[base];[base][rodape]overlay=enable='${enableOverlay}':x=0:y=H-h[outv]`,
    '-map', '[outv]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    destino
  ]);
}

// Baixa um arquivo via Rclone
function baixarArquivo(remoto, destino) {
  return new Promise((resolve, reject) => {
    console.log(`⬇️ Baixando: ${remoto}`);
    const baseName = path.basename(remoto);
    const rclone = spawn('rclone', ['copy', `meudrive:${remoto}`, '.', '--config', keyFile]);

    rclone.stderr.on('data', d => process.stderr.write(d.toString()));
    rclone.on('close', code => {
      if (code !== 0) return reject(new Error(`❌ Erro ao baixar ${remoto}`));
      if (!fs.existsSync(baseName)) return reject(new Error(`❌ Arquivo não encontrado: ${baseName}`));

      garantirPasta(destino);
      fs.renameSync(baseName, destino);
      console.log(`✅ Baixado e movido para: ${destino}`);
      resolve(destino);
    });
  });
}

// Função principal
(async () => {
  garantirPasta('temp/dummy');
  garantirPasta('saida/dummy');

  const grupos = input.arquivos.split(';').map(p => p.trim()).filter(Boolean);
  const arquivosFinais = [];

  for (const grupo of grupos) {
    const [videoRaw, imagemRaw] = grupo.split(',').map(p => p.trim());
    const videoName = path.basename(videoRaw);
    const imagemName = path.basename(imagemRaw);

    const videoTemp = `temp/${videoName}`;
    const imagemTemp = `temp/${imagemName}`;
    const videoPadronizado = `temp/padronizado_${videoName}`;
    const saidaFinal = `saida/overlay_${videoName}`;

    try {
      await baixarArquivo(videoRaw, videoTemp);
      await baixarArquivo(imagemRaw, imagemTemp);

      await reencodeVideo(videoTemp, videoPadronizado);
      await sobreporImagem(videoPadronizado, imagemTemp, saidaFinal);

      arquivosFinais.push(saidaFinal);
    } catch (err) {
      console.error(`❌ Erro ao processar:\n- Vídeo: ${videoRaw}\n- Imagem: ${imagemRaw}\n${err.message}`);
    }
  }

  if (arquivosFinais.length === 0) {
    console.error('❌ Nenhum vídeo foi processado com sucesso!');
    process.exit(1);
  }

  const listaConcat = 'temp/lista.txt';
  fs.writeFileSync(listaConcat, arquivosFinais.map(f => `file '${path.resolve(f)}'`).join('\n'));

  const videoFinal = 'saida/video_final.mp4';
  console.log('🔗 Unindo vídeos...');
  await executarFFmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', listaConcat,
    '-c', 'copy',
    videoFinal
  ]);

  console.log(`🎉 Vídeo final salvo em: ${videoFinal}`);
})();
