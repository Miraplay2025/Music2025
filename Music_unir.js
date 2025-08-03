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

function baixarArquivo(remoto, destino, reencode = true) {
  return new Promise((resolve, reject) => {
    console.log(`⬇️ Baixando: ${remoto}`);

    // Remove arquivo antigo antes de baixar para evitar conflito
    if (fs.existsSync(destino)) {
      console.log(`🧹 Removendo arquivo local antigo: ${destino}`);
      fs.unlinkSync(destino);
    }

    // Cria uma promise para o rclone copy
    const rclone = spawn('rclone', ['copy', `meudrive:${remoto}`, '.', '--config', keyFile]);

    let stderrData = '';
    rclone.stderr.on('data', d => {
      const text = d.toString();
      stderrData += text;
      process.stderr.write(text);
    });

    rclone.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`❌ Erro ao baixar ${remoto}, código ${code}. Detalhes: ${stderrData}`));
      }

      // Procura pelo arquivo baixado com o nome original
      const base = path.basename(remoto);

      if (!fs.existsSync(base)) {
        return reject(new Error(`❌ Arquivo baixado não encontrado: ${base}`));
      }

      // Renomeia para o nome esperado (destino)
      fs.renameSync(base, destino);
      console.log(`✅ Baixado e renomeado: ${destino}`);

      // Confirma tamanho e conteúdo mínimo para evitar arquivo vazio/corrompido
      const stats = fs.statSync(destino);
      if (stats.size < 1024) { // menos de 1KB? suspeito
        return reject(new Error(`❌ Arquivo ${destino} muito pequeno (${stats.size} bytes), possivelmente corrompido`));
      }

      // Se for vídeo, reencode
      (async () => {
        if (reencode && destino.endsWith('.mp4')) {
          const temp = destino.replace(/(\.[^.]+)$/, '_temp$1');
          await reencodeVideo(destino, temp);
          fs.renameSync(temp, destino);
        }
        registrarTemporario(destino);
        resolve();
      })().catch(reject);
    });
  });
}

async function sobreporImagem(videoPath, imagemPath, destino) {
  console.log(`🖼️ Sobrepondo imagem ${imagemPath} sobre ${videoPath}`);

  // Verifica se arquivos existem antes de executar ffmpeg
  if (!fs.existsSync(imagemPath)) {
    throw new Error(`Arquivo de imagem não encontrado: ${imagemPath}`);
  }
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Arquivo de vídeo não encontrado: ${videoPath}`);
  }

  await executarFFmpeg([
    '-i', imagemPath,   // imagem primeiro
    '-i', videoPath,    // vídeo segundo
    '-filter_complex',
    "[0][1]scale2ref=w=1235:h=ow/mdar[img][vid];[vid][img]overlay=x=15:y=main_h-overlay_h-15",
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
  fs.writeFileSync(lista, arquivos.map(a => `file '${a}'`).join('\n'));
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
  if (!fs.existsSync(saidaDir)) fs.mkdirSync(saidaDir);
  const caminhoFinal = path.join(saidaDir, 'video_final.mp4');
  fs.renameSync(saida, caminhoFinal);

  console.log(`📎 Link de download será gerado via artifact: ${caminhoFinal}`);
}

async function processarArquivos() {
  const pares = input.arquivos.split(';').map(p => p.trim()).filter(Boolean);
  const organizados = [];

  for (const par of pares) {
    const [videoPath, imagemPath] = par.split(',').map(p => p.trim());
    const videoNome = path.basename(videoPath);
    const imagemNome = path.basename(imagemPath);
    const saidaTemp = videoNome.replace(/\.mp4$/, '_com_img.mp4');

    try {
      await baixarArquivo(videoPath, videoNome, true);
      await baixarArquivo(imagemPath, imagemNome, false);
      await sobreporImagem(videoNome, imagemNome, saidaTemp);
      organizados.push(saidaTemp);
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
  
