const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// 📄 Ler input.json
const input = JSON.parse(fs.readFileSync('input.json', 'utf-8'));
const streamUrl = input.stream_url;
const arquivosRaw = input.arquivos.trim().split(/\r?\n/).filter(Boolean);

// 🗂 Criar diretórios necessários
if (!fs.existsSync('temp')) fs.mkdirSync('temp');
if (!fs.existsSync('saida')) fs.mkdirSync('saida');

// 📥 Função para baixar vídeo e imagem
function baixarArquivo(rclonePath, destino) {
  const res = spawnSync('rclone', ['copyto', rclonePath, destino], { stdio: 'inherit' });
  return res.status === 0;
}

let arquivosComOverlay = [];

for (const linha of arquivosRaw) {
  const [videoRclone, imagemRclone] = linha.split('|').map(s => s.trim());
  const nomeVideo = path.basename(videoRclone);
  const nomeImagem = path.basename(imagemRclone);
  const caminhoVideo = `temp/${nomeVideo}`;
  const caminhoImagem = `temp/${nomeImagem}`;
  const nomeSaida = `saida/overlay_${nomeVideo}`;

  console.log(`📥 Baixando vídeo: ${videoRclone}`);
  if (!baixarArquivo(videoRclone, caminhoVideo)) {
    console.error(`❌ Erro ao baixar vídeo: ${videoRclone}`);
    continue;
  }

  console.log(`🖼️ Baixando imagem: ${imagemRclone}`);
  if (!baixarArquivo(imagemRclone, caminhoImagem)) {
    console.error(`❌ Erro ao baixar imagem: ${imagemRclone}`);
    continue;
  }

  console.log(`🎞️ Sobrepondo imagem no vídeo...`);
  const ffmpeg = spawnSync('ffmpeg', [
    '-i', caminhoVideo,
    '-i', caminhoImagem,
    '-filter_complex', `overlay=W-w-10:H-h-10:format=auto,scale=1920:-2`,
    '-c:a', 'copy',
    '-y', nomeSaida
  ], { stdio: 'inherit' });

  if (ffmpeg.status !== 0) {
    console.error(`❌ Erro no FFmpeg ao processar:\n- Vídeo: ${videoRclone}\n- Imagem: ${imagemRclone}`);
    continue;
  }

  arquivosComOverlay.push(nomeSaida);
  console.log(`✅ Vídeo com overlay salvo em: ${nomeSaida}`);
}

// ✅ Unir todos os vídeos
if (arquivosComOverlay.length === 0) {
  console.error('❌ Nenhum vídeo foi processado com sucesso!');
  process.exit(1);
}

console.log('🧩 Unindo vídeos com overlay...');

// Criar arquivo de concatenação
const listaConcat = 'temp/lista.txt';
fs.writeFileSync(listaConcat, arquivosComOverlay.map(a => `file '${a}'`).join('\n'));

// Comando para unir
const saidaFinal = 'saida/video_final.mp4';
const concat = spawnSync('ffmpeg', [
  '-f', 'concat',
  '-safe', '0',
  '-i', listaConcat,
  '-c', 'copy',
  '-y', saidaFinal
], { stdio: 'inherit' });

if (concat.status !== 0) {
  console.error('❌ Erro ao unir os vídeos com FFmpeg.');
  process.exit(1);
}

console.log(`🎉 Vídeo final criado com sucesso: ${saidaFinal}`);
    
