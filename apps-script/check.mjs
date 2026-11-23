import {readFileSync} from 'node:fs'
import {createHash,randomUUID} from 'node:crypto'
import {createContext,runInContext} from 'node:vm'
import assert from 'node:assert/strict'

const database=new Map()
const identity=new Map()
const ctx=createContext({
  console,
  Utilities:{
    getUuid:randomUUID,
    computeDigest:(_,value)=>Array.from(createHash('sha256').update(value).digest()),
    DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
    formatDate:date=>date.toISOString().slice(0,10)
  },
  PropertiesService:{getScriptProperties:()=>({
    getProperty:key=>identity.get(key),
    setProperty:(key,value)=>identity.set(key,value),
    deleteProperty:key=>identity.delete(key)
  })},
  SpreadsheetApp:{
    flush(){},
    openById:()=>({getSheetByName:name=>{
      if (!database.has(name)) database.set(name,[])
      const data=database.get(name)
      return {
        getDataRange:()=>({getValues:()=>data.map(text=>[text])}),
        getRange:row=>({
          setValue:value=>{data[row-1]=value},
          clearContent:()=>{data[row-1]=''}
        }),
        appendRow:([text])=>data.push(text),
      }
    }})
  },
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})}
})
for (const name of ['Exam.gs','Code.gs']) runInContext(readFileSync(new URL('../dist/apps-script/'+name,import.meta.url),'utf8'),ctx)
const write=(name,data)=>database.set(name,data.map(record=>JSON.stringify(record)))
const secret='test-only-credential-1234567890abcdef'
identity.set('DATABASE_ID','in-memory')
identity.set('TEACHER_HASH',createHash('sha256').update(secret).digest('hex'))
write('Topics',[{id:1,title:'Tema 1'}])
write('Students',[{id:'test-paco-olivares',first:'Paco',last:'Olivares',group_no:3},
  {id:'student-fixture',first:'Nombre',last:'De prueba',group_no:4}])
const questions=process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2],'utf8')).questions
  : Array.from({length:20},(_,i)=>({id:'fixture-'+i,topic:1,version:1,active:true,status:'validada',
    concept:'Concepto de prueba',prompt:'Pregunta '+i,options:['A','B','C','D'],correct:0,
    explanation:'Explicación',reference:'Temario',difficulty:'baja'}))
if (process.argv[2]) write('Topics',JSON.parse(readFileSync(process.argv[2],'utf8')).topics)
write('Questions',questions)
assert.ok(ctx.validQuestion_(questions[0]))

const call=(path,input=null,token=null)=>ctx.request(path,input,token)
const paco=call('/login',{name:' Olivares,  Paco '}).token
assert.ok(paco)
assert.equal(call('/me',null,paco).value.role,'student')
assert.equal(call('/exam',null,paco).value,null)
assert.ok(call('/teacher/results',null,paco).error)
const exam=call('/exam',{topics:[1]},paco).value
assert.equal(exam.items.length,20)
assert.equal(new Set(exam.items.map(q=>q.prompt)).size,20)
assert.ok(exam.items.every(q=>!('correct' in q)))
assert.ok(call('/exam/'+exam.id+'/review',null,paco).error)
const other=call('/login',{name:'Nombre de prueba'}).token
assert.ok(call('/exam/'+exam.id+'/finish',{},other).error)
for (const [index,item] of exam.items.entries()) {
  const original=questions.find(q=>q.prompt===item.prompt)
  assert.ok(call('/exam/'+exam.id+'/answer',{index,choice:item.options.indexOf(original.options[original.correct])},paco).value)
}
assert.equal(call('/exam/'+exam.id+'/finish',{},paco).value.grade,10)
assert.equal(call('/exam/'+exam.id+'/review',null,paco).value.items.length,20)
assert.equal(call('/history',null,paco).value.results.length,1)
const teacher=call('/teacher/login',{code:secret}).token
assert.equal(call('/teacher/results',null,teacher).value.results.length,0)
assert.equal(call('/teacher/results',null,teacher).value.groups[1].students,1)
assert.match(call('/teacher/results?format=csv',null,teacher).value,/Nombre/)
const bank=call('/teacher/bank',null,teacher)
assert.equal(bank.value.length,questions.length)
assert.ok(call('/teacher/bank',bank.value[0],teacher).value.id)
assert.ok(call('/logout',{},paco).value)
assert.ok(call('/me',null,paco).error)
console.log('Apps Script: acceso, examen, revisión, historial, administración y exportación verificados localmente.')
