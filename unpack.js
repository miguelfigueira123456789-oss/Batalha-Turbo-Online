'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const text = fs.readFileSync(path.join(__dirname, 'batalha_payload.txt'),'utf8').replace(/\s+/g,'');
const packed = JSON.parse(zlib.inflateSync(Buffer.from(text,'base64')).toString('utf8'));
for (const [name, content] of Object.entries(packed)) {
  if (path.isAbsolute(name) || name.split(/[\\/]/).includes('..')) throw new Error('Invalid file path: ' + name);
  const dest = path.join(__dirname,name);
  fs.mkdirSync(path.dirname(dest), {recursive:true});
  fs.writeFileSync(dest, Buffer.from(content,'base64'));
}
console.log('Batalha Turbo: extracted',Object.keys(packed).length,'files');
