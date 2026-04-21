function fnModules() {
  var importedFiles: { src: string }[] = []

  return {
    import(scriptURL: string) {
      var el = document.createElement('script')
      el.setAttribute('src', scriptURL)
      el.setAttribute('class', scriptURL)
      document.getElementsByTagName('head')[0].appendChild(el)
      importedFiles.push({ src: scriptURL })
    },
    export() {},
    destroy() {},
    loadModules: importedFiles
  }
}

var Modules = fnModules()
