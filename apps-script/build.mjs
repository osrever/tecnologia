import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {build} from 'vite'

const root=resolve(import.meta.dirname,'..')
const out=resolve(root,'dist/apps-script')
await build({root,build:{outDir:resolve(root,'dist/apps-script-web'),emptyOutDir:true}})
const web=resolve(root,'dist/apps-script-web/assets')
const js=readFileSync(resolve(web,readdirSync(web).find(name=>name.endsWith('.js'))),'utf8')
const css=readFileSync(resolve(web,readdirSync(web).find(name=>name.endsWith('.css'))),'utf8')
const protect = source => source.replace(/(?<![.\w])(normalize|shuffle|selectQuestions|grade|validQuestion|answerChanges|randomInt)\(/g,
  (_,name)=>name+'_(').replace('.every(validQuestion)', '.every(validQuestion_)').replace('.map(normalize)', '.map(normalize_)')
const exam=readFileSync(resolve(root,'server/exam.js'),'utf8')
  .replace("import {randomInt} from 'node:crypto'",'const randomInt_ = max => Math.floor(Math.random()*max)')
  .replace(/^export /gm,'')
mkdirSync(out,{recursive:true})
writeFileSync(resolve(out,'Index.html'),`<!doctype html><html lang="es"><head><base target="_top"><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replaceAll('</script','<\\/script')}</script></body></html>`)
writeFileSync(resolve(out,'Exam.gs'),protect(exam))
writeFileSync(resolve(out,'Code.gs'),protect(readFileSync(resolve(root,'apps-script/Code.gs'),'utf8')))
writeFileSync(resolve(out,'appsscript.json'),readFileSync(resolve(root,'apps-script/manifest.json')))
console.log('Paquete generado en dist/apps-script.')

const page = readFileSync(resolve(out,'Index.html'),'utf8')
const htmlParts = page.match(/[\s\S]{1,4096}/g).map(part=>JSON.stringify(part))
const singleCode = readFileSync(resolve(out,'Code.gs'),'utf8')
  .replace("HtmlService.createHtmlOutputFromFile('Index')","HtmlService.createHtmlOutput(pageHtml_())")
const singleSetup = `
function prepararPrueba() {
  const active = Session.getActiveUser().getEmail()
  if (!active || active !== Session.getEffectiveUser().getEmail()) {
    throw Error('Ejecuta esta función desde el editor con la cuenta propietaria.')
  }
  prepararPrueba_()
}

function prepararPrueba_() {
  const files = DriveApp.getFilesByName('banco-literal-autoevaluacion-tic.json')
  const fingerprint = '625befb7b8863cce5334c2a78f31aaba6bcc32257cfa1f1c0ffedc1cd5ed1331'
  while (files.hasNext()) {
    const text = files.next().getBlob().getDataAsString('UTF-8')
    if (hash_(text) !== fingerprint) continue
    setupPrivate_()
    activateLiteralBank_(JSON.parse(text))
    console.log('Banco literal activo. Prueba privada preparada. Usuario: Paco Olivares.')
    return
  }
  throw Error('No se encuentra el nuevo banco literal verificado en esta cuenta.')
}
`
const single = resolve(root,'dist/apps-script-un-archivo')
mkdirSync(single,{recursive:true})
writeFileSync(resolve(single,'Pegar-en-Codigo.gs.txt'),[
  singleCode,readFileSync(resolve(out,'Exam.gs'),'utf8'),singleSetup,
  'function pageHtml_() { return [\n'+htmlParts.join(',\n')+'\n].join(\'\') }\n'
].join('\n'))
