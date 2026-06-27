function resolveWixImage(url) {
  if (!url) return '/logo.png';
  if (!url.startsWith('wix:image://v1/')) return url;
  const parts = url.split('/');
  if (parts.length > 3) {
    return `https://static.wixstatic.com/media/${parts[3]}`;
  }
  return '/logo.png';
}

console.log(resolveWixImage("wix:image://v1/001429_c1dd33f83d0740378cf9232aae988560~mv2.png/Gemini_Generated_Image_ecofdsecofdsecof.png#originWidth=2816&originHeight=1536"));
