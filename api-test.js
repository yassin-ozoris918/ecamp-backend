const http = require('http');

http.get('http://localhost:3000/academic-data/universities', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(`API returned ${parsed.length} universities.`);
      console.log(parsed.map(u => u.nameEn));
    } catch(e) {
      console.log('Parse error', e.message);
    }
  });
}).on('error', err => console.log('Error:', err.message));
