const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Caminho do rclone.conf
const keyFile = path.join(os.homedir(), '.config', 'rclone', 'rclone.conf');

// Ler dados do input.json
const input = JSON.parse(fs.readFileSync('input.json', 'utf-8'));
console.log('🔗 Stream URL:', input.stream_url);
console.log('📄 Arquivos raw:', input.arquivos);

// Função para executar comandos do FFmpeg
function executarFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: 'inherit' });
    ffmpeg.on('close', code => {
      if (code !== 0) reject(new Error(`Erro no FFmpeg (código ${code})`));
      else resolve();
    });
  });
}

// Função para reencodar o vídeo
async function reencodeVideo(input, output) {
  console.log(`🔄 Reencodando ${input} → ${output}`);
  await executarFFmpeg([
    '-i', input,
    '-vf', 'scale=1280:720,fps=60',
    '-r', '60',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-acodec', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    output
  ]);
  console.log(`✅ Reencodado: ${output}`);
}

// Função para garantir que a pasta existe
function garantirPasta(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Função para baixar arquivos com rclone
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

// Execução principal
(async () => {
  // Criar pastas principais
  garantirPasta('saida/dummy.txt');
  garantirPasta('temp/dummy.txt');

  const grupos = input.arquivos.split(';').map(p => p.trim()).filter(Boolean);

  for (const grupo of grupos) {
    const [videoRaw, imagemRaw] = grupo.split(',').map(p => p.trim());

    const videoName = path.basename(videoRaw);
    const imagemName = path.basename(imagemRaw);

    const videoDestino = `temp/${videoName}`;
    const imagemDestino = `temp/${imagemName}`;
    const reencodedDestino = `saida/${videoName}`;

    try {
      await baixarArquivo(videoRaw, videoDestino);
      garantirPasta(reencodedDestino); // 🔧 Garante que a pasta existe antes do reencode
      await reencodeVideo(videoDestino, reencodedDestino);
      await baixarArquivo(imagemRaw, imagemDestino);

      console.log(`🎬 Vídeo: ${reencodedDestino}`);
      console.log(`🖼️ Imagem: ${imagemDestino}`);
    } catch (err) {
      console.error(`❌ Erro ao processar par:\n- Vídeo: ${videoRaw}\n- Imagem: ${imagemRaw}\n`, err.message);
    }
  }

  console.log('✅ Todos os vídeos foram processados.');
})();
