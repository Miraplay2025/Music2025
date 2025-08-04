const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const keyFile = path.join(os.homedir(), '.config', 'rclone', 'rclone.conf');
const input = JSON.parse(fs.readFileSync('input.json', 'utf-8'));

console.log('🔗 Stream URL:', input.stream_url);
console.log('📄 Arquivos raw:', input.arquivos);

// Executa o FFmpeg com os argumentos fornecidos
function executarFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: 'inherit' });
    ffmpeg.on('close', code => {
      if (code !== 0) reject(new Error(`Erro no FFmpeg (código ${code})`));
      else resolve();
    });
  });
}

// Garante que a pasta de destino exista
function garantirPasta(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Reencoda o vídeo e sobrepõe a imagem como rodapé centralizado
async function reencodeEOverlay(inputVideo, inputImage, outputVideo) {
  console.log(`🎬 Reencodando e sobrepondo imagem como rodapé em ${inputVideo}`);
  garantirPasta(outputVideo);

  await executarFFmpeg([
    '-i', inputVideo,
    '-i', inputImage,
    '-filter_complex', '[1]scale=1235:-1[img];[0][img]overlay=(W-w)/2:H-h',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-r', '60',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    outputVideo
  ]);

  console.log(`✅ Criado: ${outputVideo}`);
}

// Baixa um arquivo remoto via Rclone e move para o destino
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
  const grupos = input.arquivos.split(';').map(p => p.trim()).filter(Boolean);
  const arquivosFinais = [];

  for (const grupo of grupos) {
    const [videoRaw, imagemRaw] = grupo.split(',').map(p => p.trim());

    const videoName = path.basename(videoRaw);
    const imagemName = path.basename(imagemRaw);

    const videoDestino = `temp/${videoName}`;
    const imagemDestino = `temp/${imagemName}`;
    const saidaFinal = `saida/overlay_${videoName}`;

    try {
      await baixarArquivo(videoRaw, videoDestino);
      await baixarArquivo(imagemRaw, imagemDestino);
      garantirPasta(saidaFinal);
      await reencodeEOverlay(videoDestino, imagemDestino, saidaFinal);
      arquivosFinais.push(saidaFinal);
    } catch (err) {
      console.error(`❌ Erro ao processar:\n- Vídeo: ${videoRaw}\n- Imagem: ${imagemRaw}\n${err.message}`);
    }
  }

  if (arquivosFinais.length === 0) {
    console.error('❌ Nenhum vídeo foi processado com sucesso!');
    process.exit(1);
  }

  // Criar arquivo de concatenação
  const listaConcat = 'temp/lista.txt';
  garantirPasta(listaConcat);
  fs.writeFileSync(listaConcat, arquivosFinais.map(f => `file '${path.resolve(f)}'`).join('\n'));

  // Concatenar os vídeos
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
