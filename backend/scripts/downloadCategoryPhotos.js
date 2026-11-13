// Download only the curated, openly licensed Pexels category illustrations.
// This prepares local JPEG fixtures; it never connects to the application's database.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const directory = path.resolve(__dirname, 'fixtures/category-demo');
const metadataPath = path.join(directory, 'photos.json');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');

function validateImage(data) {
  if (!data.length || data.length > 1024 * 1024 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff ||
      data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) {
    throw new Error('A photo is not a complete JPEG within the 1 MiB limit.');
  }
}

async function download(photo) {
  if (!/^\d+$/.test(photo.id) || photo.file !== `photos/pexels-${photo.id}.jpg`) throw new Error('Invalid photo fixture path.');
  const url = new URL(photo.downloadUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'images.pexels.com' ||
      url.pathname !== `/photos/${photo.id}/pexels-photo-${photo.id}.jpeg`) {
    throw new Error('Only the curated Pexels image endpoint is allowed.');
  }
  const filename = path.join(directory, photo.file);
  let data;
  if (fs.existsSync(filename)) {
    data = fs.readFileSync(filename);
    validateImage(data);
    if (photo.sha256 && photo.sha256 !== hash(data)) throw new Error('A cached image differs from its recorded checksum.');
  } else {
    const response = await fetch(url, {
      redirect: 'error', signal: AbortSignal.timeout(25000), headers: { Accept: 'image/jpeg' },
    });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) {
      throw new Error(`Photo ${photo.id} could not be downloaded as JPEG (HTTP ${response.status}).`);
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > 1024 * 1024) throw new Error('A photo exceeds the download size limit.');
    data = Buffer.from(await response.arrayBuffer());
    validateImage(data);
    fs.writeFileSync(filename, data, { flag: 'wx' });
  }
  photo.sha256 = hash(data);
  photo.bytes = data.length;
}

async function main() {
  fs.mkdirSync(path.join(directory, 'photos'), { recursive: true });
  // Small batches avoid opening a large burst of connections to the public photo CDN.
  for (let offset = 0; offset < metadata.photos.length; offset += 4) {
    const batch = metadata.photos.slice(offset, offset + 4);
    const results = await Promise.allSettled(batch.map(download));
    // Keep verified metadata even if another image in this batch needs a later retry.
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    console.log(JSON.stringify({ downloadedOrVerified: Math.min(offset + batch.length, metadata.photos.length), total: metadata.photos.length }));
  }
  console.log(JSON.stringify({ stage: 'complete', photographs: metadata.photos.length,
    bytes: metadata.photos.reduce((total, photo) => total + photo.bytes, 0) }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
