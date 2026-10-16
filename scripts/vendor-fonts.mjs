import { mkdir, writeFile } from 'node:fs/promises';
const endpoint = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400..700&family=Manrope:wght@400..800&display=swap';
const response = await fetch(endpoint, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' } });
if (!response.ok) throw new Error(`Font stylesheet: ${response.status}`);
const stylesheet = await response.text();
const blocks = stylesheet.match(/\/\*[^]*?\*\/\s*@font-face\s*\{[^}]*\}/g)?.filter(b => /^\/\* latin(?:-ext)? \*\//.test(b));
if (!blocks?.length) throw new Error('Latin and Latin Extended font subsets were not available.');
await mkdir('public/fonts', { recursive: true });
let css = '';
for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];
  const url = block.match(/url\((https:[^)]+)\)/)?.[1];
  if (!url) throw new Error('Missing font URL');
  const result = await fetch(url);
  if (!result.ok) throw new Error(`Font file: ${result.status}`);
  const name = `font-${i}.woff2`;
  await writeFile(`public/fonts/${name}`, Buffer.from(await result.arrayBuffer()));
  css += `${block.replace(url, `/fonts/${name}`)}\n`;
}
await writeFile('src/fonts.css', css);
console.log(`Vendored ${blocks.length} Latin / Latin Extended font subsets.`);
