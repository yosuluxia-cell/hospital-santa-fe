const git = require('isomorphic-git');
const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');

async function main() {
  console.log('Iniciando repositorio Git en:', repoDir);
  await git.init({ fs, dir: repoDir, defaultBranch: 'main' });
  console.log('Repositorio Git inicializado con rama main.');

  // Ignorar archivos
  const ignoredPatterns = [
    'node_modules',
    'dist',
    '.env',
    '.git',
    '.DS_Store'
  ];

  function shouldIgnore(relPath) {
    const normalized = relPath.replace(/\\/g, '/');
    for (const pat of ignoredPatterns) {
      if (normalized === pat || normalized.startsWith(pat + '/') || normalized.includes('/' + pat + '/') || normalized.endsWith('/' + pat)) {
        return true;
      }
    }
    return false;
  }

  function getAllFiles(dir, baseDir = dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      if (shouldIgnore(relPath)) return;

      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getAllFiles(fullPath, baseDir));
      } else {
        results.push(relPath);
      }
    });
    return results;
  }

  const files = getAllFiles(repoDir);
  console.log(`Agregando ${files.length} archivos a Git staging...`);

  for (const filepath of files) {
    await git.add({ fs, dir: repoDir, filepath });
  }

  const sha = await git.commit({
    fs,
    dir: repoDir,
    author: {
      name: 'Hospital de Santa Fe',
      email: 'tecnologia@hospital-santafe.gob.bo'
    },
    message: 'feat: hospital de santa fe - emr system, supabase cloud db, rbac and clean ui'
  });

  console.log('✅ Commit realizado exitosamente con SHA:', sha);
}

main().catch(err => {
  console.error('Error al inicializar commit:', err);
  process.exit(1);
});
