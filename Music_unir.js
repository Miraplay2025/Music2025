const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Pasta para baixar arquivos
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

const keyFile = path.join(os.homedir(), '.config', 'rclone', 'rclone.conf');
const input = JSON.parse(fs.readFileSync('input.json', 'utf-8'));

console.log('🔗 Stream URL:', input.stream_url);
console.log('📄 Arquivos raw:', input.arquivos);

function registrarTemporario(nome) {
  console.log(`🗂️ Registrado temporário: ${nome}`);
}

function executarFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [...args, '-y']);
    ffmpeg.stderr.on('data', data => process.stderr.write(data.toString()));
    ffmpeg.on('close', code => {
      if (code !== 0) return reject(new Error(`FFmpeg falhou com código ${code}`));
      resolve();
    });
  });
}

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

function baixarArquivo(remoto, destino, reencode = true) {
  return new Promise((resolve, reject) => {
    console.log(`⬇️ Baixando: ${remoto}`);
    const rclone = spawn('rclone', ['copy', `meudrive:${remoto}`, downloadsDir, '--config', keyFile]);
    rclone.stderr.on('data', d => process.stderr.write(d.toString()));
    rclone.on('close', async code => {
      if (code !== 0) return reject(new Error(`❌ Erro ao baixar ${remoto}`));

      const base = path.basename(remoto);
      const arquivoCompleto = path.join(downloadsDir, base);

      if (!fs.existsSync(arquivoCompleto)) 
        return reject(new Error(`❌ Arquivo não encontrado: ${arquivoCompleto}`));

      // Se destino diferente do base, renomear dentro da pasta downloads
      if (base !== destino) {
        const destinoCompleto = path.join(downloadsDir, destino);
        fs.renameSync(arquivoCompleto, destinoCompleto);
        console.log(`✅ Baixado e renomeado: ${destinoCompleto}`);
      } else {
        console.log(`✅ Baixado: ${arquivoCompleto}`);
      }

      if (reencode && destino.endsWith('.mp4')) {
        const original = path.join(downloadsDir, destino);
        const temp = original.replace(/(\.[^.]+)$/, '_temp$1');
        await reencodeVideo(original, temp);
        fs.renameSync(temp, original);
      }
      registrarTemporario(destino);
      resolve();
    });
  });
}

async function sobreporImagem(videoPath, imagemPath, destino) {
  console.log(`🖼️ Sobrepondo imagem ${imagemPath} sobre ${videoPath}`);

  const videoFullPath = path.join(downloadsDir, videoPath);
  const imagemFullPath = path.join(downloadsDir, imagemPath);
  const destinoFullPath = path.join(downloadsDir, destino);

  await executarFFmpeg([
    '-i', videoFullPath,
    '-i', imagemFullPath,
    '-filter_complex',
    "[1][0]scale2ref=w=1235:h=ow/mdar[img][vid];[vid][img]overlay=x=15:y=main_h-overlay_h-15",
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    destinoFullPath
  ]);
  console.log(`🎬 Criado vídeo com imagem sobreposta: ${destinoFullPath}`);
}

async function juntarVideos(arquivos, saida) {
  // Caminho da lista.txt na pasta downloads
  const listaPath = path.join(downloadsDir, 'lista.txt');
  // Criar arquivo lista.txt com paths corretos e escapando apostrofos
  const linhas = arquivos.map(a => `file '${a.replace(/'/g, "'\\''")}'`);
  fs.writeFileSync(listaPath, linhas.join('\n'));

  const saidaFullPath = path.join(downloadsDir, saida);

  await executarFFmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', listaPath,
    '-c', 'copy',
    saidaFullPath
  ]);

  const stats = fs.statSync(saidaFullPath);
  const mb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`📦 Vídeo final gerado: ${saidaFullPath} (${mb} MB)`);

  // Move para pasta saida na raiz para o GitHub artifact
  const saidaDir = path.join(__dirname, 'saida');
  if (!fs.existsSync(saidaDir)) fs.mkdirSync(saidaDir);
  const destinoFinal = path.join(saidaDir, 'video_final.mp4');
  fs.renameSync(saidaFullPath, destinoFinal);

  console.log(`📎 Link de download será gerado pelo GitHub Actions (artifact): saida/video_final.mp4`);
}

async function processarArquivos() {
  const pares = input.arquivos.split(';').map(p => p.trim()).filter(Boolean);
  const organizados = [];

  for (const par of pares) {
    const [videoPath, imagemPath] = par.split(',').map(p => p.trim());
    const videoNome = path.basename(videoPath);
    const imagemNome = path.basename(imagemPath);

    try {
      await baixarArquivo(videoPath, videoNome, true);
      await baixarArquivo(imagemPath, imagemNome, false);
      const finalComImagem = videoNome.replace(/\.mp4$/, '_final.mp4');
      await sobreporImagem(videoNome, imagemNome, finalComImagem);
      organizados.push(finalComImagem);
    } catch (err) {
      console.error(`❌ Erro ao processar ${videoPath} + ${imagemPath}:`, err.message);
    }
  }

  if (organizados.length > 0) {
    await juntarVideos(organizados, 'video_final.mp4');
  } else {
    console.error('⚠️ Nenhum vídeo disponível para juntar.');
  }
}

processarArquivos().catch(err => {
  console.error('❌ Erro geral:', err.message);
  process.exit(1);
});
    
