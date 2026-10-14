const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const server = http.createServer((req, res) => {
  const files = { '/':'fixture.html', '/fixture.html':'fixture.html', '/frame.html':'frame.html' };
  const file = files[req.url];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(__dirname,'../tests',file)));
});
server.listen(0,'127.0.0.1',() => console.log(`Proper Search demo: http://127.0.0.1:${server.address().port}/`));
