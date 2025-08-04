const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

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

function garantirPasta(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function baixarArquivo(remoto, destino, reencode = true) {
  return new Promise((resolve, reject) => {
    console.log(`⬇️ Baixando: ${remoto}`);
    const baseName = path.basename(remoto);
    const rclone = spawn('rclone', ['copy', `meudrive:${remoto}`, '.', '--config', keyFile]);
    rclone.stderr.on('data', d => process.stderr.write(d.toString()));
    rclone.on('close', async code => {
      if (code !== 0) return reject(new Error(`❌ Erro ao baixar ${remoto}`));
      if (!fs.existsSync(baseName)) return reject(new Error(`❌ Arquivo não encontrado: ${baseName}`));

      garantirPasta(destino);
      fs.renameSync(baseName, destino);
      console.log(`✅ Baixado e movido para: ${destino}`);

      const ext = path.extname(destino).toLowerCase();

      if (reencode && ['.mp4', '.mov', '.mkv', '.avi'].includes(ext)) {
        const temp = destino.replace(/(\.[^.]+)$/, '_temp$1');
        await reencodeVideo(destino, temp);
        fs.renameSync(temp, destino);
      } else if (!['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(ext)) {
        console.warn(`⚠️ Tipo de arquivo não reconhecido como vídeo ou imagem: ${ext}`);
      }

      registrarTemporario(destino);
      resolve();
    });
  });
}

async function sobreporImagem(videoPath, imagemPath, destino) {
  console.log(`🖼️ Sobrepondo imagem ${imagemPath} sobre ${videoPath}`);
  await executarFFmpeg([
    '-i', videoPath,
    '-i', imagemPath,
    '-filter_complex',
    "[1][0]scale2ref=w=1235:h=ow/mdar[img][vid];[vid][img]overlay=x=15:y=main_h-overlay_h-15",
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    destino
  ]);
  console.log(`🎬 Criado vídeo com imagem sobreposta: ${destino}`);
}

async function juntarVideos(arquivos, saida) {
  const lista = 'lista.txt';
  const conteudoLista = arquivos.map(a => `file '${a.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(lista, conteudoLista);

  await executarFFmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', lista,
    '-c', 'copy',
    saida
  ]);

  const stats = fs.statSync(saida);
  const mb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`📦 Vídeo final gerado: ${saida} (${mb} MB)`);

  const saidaDir = path.join(__dirname, 'saida');
  garantirPasta(saidaDir);

  const videoFinal = path.join(saidaDir, 'video_final.mp4');
  fs.renameSync(saida, videoFinal);

  console.log(`📎 Artefato salvo: ${videoFinal}`);
}

async function processarArquivos() {
  const pares = input.arquivos.split(';').map(p => p.trim()).filter(Boolean);
  const organizados = [];

  // 🔧 Cria antecipadamente as pastas
  for (const par of pares) {
    const [videoPath, imagemPath] = par.split(',').map(p => p.trim());
    if (videoPath) garantirPasta(videoPath);
    if (imagemPath) garantirPasta(imagemPath);
  }

  for (const par of pares) {
    const [videoPath, imagemPath] = par.split(',').map(p => p.trim());

    try {
      const extVideo = path.extname(videoPath).toLowerCase();
      const extImagem = path.extname(imagemPath).toLowerCase();

      if (!['.mp4', '.mov', '.mkv'].includes(extVideo)) {
        console.warn(`⚠️ Ignorado: ${videoPath} não é um vídeo suportado`);
        continue;
      }
      if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extImagem)) {
        console.warn(`⚠️ Ignorado: ${imagemPath} não é uma imagem suportada`);
        continue;
      }

      await baixarArquivo(videoPath, videoPath, true);
      await baixarArquivo(imagemPath, imagemPath, false);
      const finalComImagem = videoPath.replace(/\.mp4$/, '_final.mp4');
      await sobreporImagem(videoPath, imagemPath, finalComImagem);
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

// 🚀 Executa
processarArquivos().catch(err => {
  console.error('❌ Erro geral:', err.message);
  process.exit(1);
});
