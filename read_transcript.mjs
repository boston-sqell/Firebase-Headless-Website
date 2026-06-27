import fs from 'fs';
const lines = fs.readFileSync('C:\\Users\\User\\.gemini\\antigravity\\brain\\e72d43d1-545e-4006-8e4e-323f5a15a311\\.system_generated\\logs\\transcript.jsonl', 'utf-8').split('\n');
const results = lines.filter(l => l.includes('type":"VIEW_FILE"') && l.includes('index.astro') && l.includes('File Path') && !l.includes('12:20:15Z'));
if(results.length > 0) {
  const json = JSON.parse(results[0]);
  console.log(json.content.substring(0, 1500));
} else {
  console.log('No matches');
}
