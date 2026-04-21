Bun.serve({
  port: 8080,
  fetch(req) {
    var url = new URL(req.url).pathname
    if (url === '/') {
      url = '/index.html'
    }
    if (url === '/favicon.ico') {
      return new Response('', { status: 204 })
    }
    var path = './app' + url
    var file = Bun.file(path)
    if (!file.exists()) {
      return new Response('Not Found', { status: 404 })
    }
    return new Response(file)
  }
})

console.log('Server running at http://localhost:8080')
setInterval(function() {}, 60000)