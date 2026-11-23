import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {build} from 'vite'

const root=resolve(import.meta.dirname,'..')
const out=resolve(root,'dist/apps-script')
await build({root,build:{outDir:resolve(root,'dist/apps-script-web'),emptyOutDir:true}})
const web=resolve(root,'dist/apps-script-web/assets')
const js=readFileSync(resolve(web,readdirSync(web).find(name=>name.endsWith('.js'))),'utf8')
const css=readFileSync(resolve(web,readdirSync(web).find(name=>name.endsWith('.css'))),'utf8')
const protect = source => source.replace(/(?<![.\w])(normalize|shuffle|selectQuestions|grade|validQuestion|randomInt)\(/g,
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
  const properties = props_()
  if (!properties.getProperty('BANK_FILE_ID')) {
    const files = DriveApp.getFilesByName('banco-privado-autoevaluacion-tic.json')
    const fingerprint = '80ee8e471d1ab976031c1935855736d08fbbe0250977f4b389073bfb8ac046e7'
    while (files.hasNext()) {
      const file = files.next()
      if (hash_(file.getBlob().getDataAsString('UTF-8')) === fingerprint) {
        properties.setProperty('BANK_FILE_ID', file.getId())
        break
      }
    }
  }
  if (!properties.getProperty('BANK_FILE_ID')) throw Error('No se encuentra el banco de preguntas verificado en esta cuenta.')
  setupPrivate_()
  importBank_()
  console.log('Prueba privada preparada. Usuario: Paco Olivares.')
}
`
const single = resolve(root,'dist/apps-script-un-archivo')
mkdirSync(single,{recursive:true})
writeFileSync(resolve(single,'Pegar-en-Codigo.gs.txt'),[
  singleCode,readFileSync(resolve(out,'Exam.gs'),'utf8'),singleSetup,
  'function pageHtml_() { return [\n'+htmlParts.join(',\n')+'\n].join(\'\') }\n'
].join('\n'))
