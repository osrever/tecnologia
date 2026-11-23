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
