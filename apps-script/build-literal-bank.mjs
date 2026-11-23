import {createHash} from 'node:crypto'
import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {validQuestion} from '../server/exam.js'

const [sourceDir, previousBank, output] = process.argv.slice(2)
if (!sourceDir || !previousBank || !output) throw Error('Indica el directorio de fuentes, el banco anterior y el destino privado.')
const {topics}=JSON.parse(readFileSync(previousBank,'utf8'))
const text=value=>value.normalize('NFC').replace(/\s+/g,' ').trim()
const questions=[]
for (const {id,title} of topics) {
  const source=text(readFileSync(join(sourceDir,id+'.txt'),'utf8'))
  const seen=new Set()
  for (const [index,line] of readFileSync(join(sourceDir,'literal-'+id+'.txt'),'utf8').trim().split(/\r?\n/).entries()) {
    const fields=line.split('|').map(text)
    const [section,excerpt,answer,...distractors]=fields
    const label='Tema '+id+', fila '+(index+1)
    if (fields.length!==6 || fields.some(field=>!field) || !source.includes(excerpt) ||
        excerpt.split(answer).length!==2 || seen.has(excerpt)) throw Error('La cita o respuesta no coincide: '+label)
    seen.add(excerpt)
    const prompt='Completa el texto de los apuntes: «'+excerpt.replace(answer,'[…]')+'»'
    const question={
      id:'TL'+String(id).padStart(2,'0')+'-'+String(index+1).padStart(3,'0'),
      topic:id,concept:section,prompt,options:[answer,...distractors],correct:0,
      explanation:'Texto literal de los apuntes: «'+excerpt+'»',
      reference:'Tema '+id+' · '+title+' · '+section,
      difficulty:'media',status:'validada',active:true,
    }
    if (!validQuestion(question)) throw Error('Pregunta inválida: '+label)
    questions.push(question)
  }
  if (seen.size<20) throw Error('El tema '+id+' necesita al menos 20 citas distintas.')
  console.log('Tema '+id+': '+seen.size+' preguntas con cita literal.')
}
const payload=JSON.stringify({topics,questions},null,2)+'\n'
writeFileSync(output,payload,{mode:0o600})
console.log('Total: '+questions.length+'. SHA-256: '+createHash('sha256').update(payload).digest('hex'))
