/**
 * Script auxiliar para subir el repositorio a GitHub sin requerir Git instalado en el sistema
 * Uso: node push-github.js <repo-url> <github-pat-token>
 * Ejemplo: node push-github.js https://github.com/usuario/hospital-emr.git ghp_xxxx
 */
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');
const url = process.argv[2];
const token = process.argv[3];

if (!url) {
  console.log('Uso: node push-github.js <URL_DEL_REPOSITORIO_GITHUB> [TOKEN_PAT]');
  console.log('Ejemplo: node push-github.js https://github.com/mi-usuario/hospital-santafe.git');
  process.exit(0);
}

async function push() {
  console.log(`Subiendo rama main a: ${url}...`);

  await git.addRemote({
    fs,
    dir: repoDir,
    remote: 'origin',
    url: url,
    force: true
  });

  const pushResult = await git.push({
    fs,
    http,
    dir: repoDir,
    remote: 'origin',
    ref: 'main',
    onAuth: () => ({ username: token || 'git', password: token || '' })
  });

  console.log('✅ Repositorio subido a GitHub exitosamente!', pushResult);
}

push().catch(err => {
  console.error('Error al subir a GitHub:', err.message);
});
