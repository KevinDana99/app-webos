function fnModules() {
  var importedFiles: { src: string }[] = []
  var pending: { (): void }[] = []

  function loadNext() {
    if (pending.length > 0) {
      var next = pending.shift()
      if (next) {
        next()
      }
    }
  }

  return {
    import(scriptURL: string, callback?: { (): void }) {
      var el: any = document.createElement('script')
      el.setAttribute('type', 'text/javascript')
      el.setAttribute('src', scriptURL)
      el.setAttribute('class', scriptURL)
      el.onload = function() {
        importedFiles.push({ src: scriptURL })
        if (callback) {
          callback()
        }
        loadNext()
      }
      el.onerror = function() {
        loadNext()
      }
      el.onreadystatechange = function() {
        if (el.readyState === 'loaded' || el.readyState === 'complete') {
          if (el.onload) {
            el.onload({} as Event)
          }
        }
      }
      document.getElementsByTagName('head')[0].appendChild(el)
    },
    importSync(scriptURL: string) {
      pending.push(function() {
        var el: any = document.createElement('script')
        el.setAttribute('type', 'text/javascript')
        el.setAttribute('src', scriptURL)
        el.setAttribute('class', scriptURL)
        document.getElementsByTagName('head')[0].appendChild(el)
      })
    },
    export() {},
    destroy() {},
    loadModules: importedFiles
  }
}

var Modules = fnModules()
