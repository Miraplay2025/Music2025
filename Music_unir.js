const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Caminho do rclone.conf
const keyFile = path.join(os.homedir(), '.config', 'rclone', 'rclone.conf');

// Lê input.json
const input = JSON.parse(fs.readFileSync('input.json', 'utf-8'));

console.log('🔗 Stream URL:', input.stream_url);
console.log('📄 Arquivos raw:', input.arquivos);

// Simulação: registrar arquivos temporários
function registrarTemporario(nome) {
  console.log(`🗂️ Registrado temporário: ${nome}`);
}

// Simulação: reencodar o vídeo
function reencodeVideo(origem, destino) {
  return new Promise((resolve, reject) => {
    console.log(`🎞️ Reencodando: ${origem} -> ${destino}`);
    const ffmpeg = spawn('ffmpeg', ['-i', origem, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-y', destino]);
    ffmpeg.stderr.on('data', d => process.stderr.write(d.toString()));
    ffmpeg.on('close', code => {
      if (code !== 0) return reject(new Error(`Erro ao reencodar ${origem}`));
      resolve();
    });
  });
}

// Baixar com rclone
function baixarArquivo(remoto, destino, reencode = true) {
  return new Promise((resolve, reject) => {
    console.log(`⬇️ Baixando: ${remoto}`);
    const rclone = spawn('rclone', ['copy', `meudrive:${remoto}`, '.', '--config', keyFile]);
    rclone.stderr.on('data', d => process.stderr.write(d.toString()));
    rclone.on('close', async code => {
      if (code !== 0) return reject(new Error(`❌ Erro ao baixar ${remoto}`));
      const base = path.basename(remoto);
      if (!fs.existsSync(base)) return reject(new Error(`❌ Arquivo não encontrado: ${base}`));
      fs.renameSync(base, destino);
      console.log(`✅ Baixado e renomeado: ${destino}`);
      if (reencode && destino.endsWith('.mp4')) {
        const temp = destino.replace(/(\.[^.]+)$/, '_temp$1');
        await reencodeVideo(destino, temp);
        fs.renameSync(temp, destino);
        console.log(`✅ Reencodado: ${destino}`);
      }
      registrarTemporario(destino);
      resolve();
    });
  });
}

// Processamento dos pares de arquivos
async function processarArquivos() {
  const pares = input.arquivos.split(';').map(par => par.trim()).filter(Boolean);
  const arquivosBaixados = [];

  for (const par of pares) {
    const [videoPath, imagemPath] = par.split(',').map(p => p.trim());
    const videoNome = path.basename(videoPath);
    const imagemNome = path.basename(imagemPath);

    try {
      await baixarArquivo(videoPath, videoNome, true);
      await baixarArquivo(imagemPath, imagemNome, false);
      arquivosBaixados.push({ video: videoNome, imagem: imagemNome });
    } catch (err) {
      console.error(`❌ Erro ao processar par: ${videoPath} + ${imagemPath}\n`, err.message);
    }
  }

  console.log('\n📂 Arquivos baixados e organizados:');
  for (const item of arquivosBaixados) {
    console.log(`🎬 Vídeo: ${item.video} 🎨 Imagem: ${item.imagem}`);
  }
}

processarArquivos().catch(err => {
  console.error('❌ Erro geral:', err.message);
  process.exit(1);
});
