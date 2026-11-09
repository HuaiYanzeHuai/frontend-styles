'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

const ROOT = __dirname;
const PREVIEW_FILE = '预览.html';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 8000;
const URL_ROOT = `http://${HOST}:${PORT}/`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

function readMeta(filePath) {
  let source = '';
  try {
    const descriptor = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(128 * 1024);
    const bytes = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    fs.closeSync(descriptor);
    source = buffer.subarray(0, bytes).toString('utf8');
  } catch (error) {
    return {};
  }

  const meta = (name) => {
    const patterns = [
      new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i')
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match) return match[1];
    }
    return '';
  };

  return {
    name: meta('theme-name'),
    description: meta('theme-description'),
    primary: meta('theme-primary'),
    accent: meta('theme-accent')
  };
}

function listThemes() {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => /\.html$/i.test(entry.name))
    .filter((entry) => entry.name !== PREVIEW_FILE && !entry.name.startsWith('.'))
    .map((entry) => {
      const filePath = path.join(ROOT, entry.name);
      const meta = readMeta(filePath);
      const txtName = entry.name.replace(/\.html$/i, '.txt');
      const hasTxt = fs.existsSync(path.join(ROOT, txtName));

      return {
        html: entry.name,
        txt: hasTxt ? txtName : '',
        name: meta.name || entry.name.replace(/\.html$/i, ''),
        description: meta.description || '独立配色模块 · 与同名 TXT 源码配对',
        primary: meta.primary || '',
        accent: meta.accent || ''
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
}

function serveFile(request, response, filePath) {
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('404 Not Found');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };

    response.writeHead(200, headers);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
    stream.pipe(response);
  });
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Allow': 'GET, HEAD'
    });
    response.end('405 Method Not Allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, URL_ROOT).pathname);
  } catch (error) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('400 Bad Request');
    return;
  }

  if (pathname === '/api/themes') {
    try {
      sendJson(response, 200, { files: listThemes() });
    } catch (error) {
      sendJson(response, 500, { error: '无法读取目录', detail: error.message });
    }
    return;
  }

  if (pathname === '/' || pathname === '') {
    serveFile(request, response, path.join(ROOT, PREVIEW_FILE));
    return;
  }

  const filePath = path.resolve(ROOT, '.' + pathname);
  const relative = path.relative(ROOT, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('403 Forbidden');
    return;
  }

  serveFile(request, response, filePath);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，请关闭占用该端口的程序，或设置其他端口后重试。`);
    console.error('例如：set PORT=8080 && node server.js');
  } else {
    console.error('启动失败：', error);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  配色方案预览服务已启动');
  console.log(`  预览地址：${URL_ROOT}`);
  console.log(`  接口地址：${URL_ROOT}api/themes`);
  console.log('  按 Ctrl+C 停止服务');
  console.log('');

  if (process.argv.includes('--open')) {
    const command = process.platform === 'win32'
      ? `start "" "${URL_ROOT}"`
      : process.platform === 'darwin'
        ? `open "${URL_ROOT}"`
        : `xdg-open "${URL_ROOT}"`;
    exec(command, (error) => {
      if (error) console.error('无法自动打开浏览器，请手动访问上面的预览地址。');
    });
  }
});
