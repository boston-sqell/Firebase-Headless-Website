const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.astro') || file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src');
let changedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  
  // Replace standard links
  content = content.replace(/href="([^"]+)\.html"/g, 'href="/$1"');
  // Replace /index -> /
  content = content.replace(/href="\/index"/g, 'href="/"');
  // Replace links like /products/123.html
  content = content.replace(/href={`\/products\/\${([^}]+)}\.html`}/g, 'href={`/products/${$1}`}');
  content = content.replace(/href={`\/brands\/\${([^}]+)}\.html`}/g, 'href={`/brands/${$1}`}');
  
  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log(`Updated links in ${file}`);
    changedCount++;
  }
});

console.log(`Updated ${changedCount} files.`);
