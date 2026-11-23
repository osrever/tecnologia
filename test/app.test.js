import test from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import {openDatabase} from '../server/db.js'
import {app} from '../server/index.js'
import {grade, normalize, selectQuestions} from '../server/exam.js'
import {hashCode} from '../server/auth.js'

const synthetic = (topic,i)=>({topic,id:topic+'-'+i,version:1,concept:'Fixture',prompt:'Fixture '+topic+'-'+i,
  options:['Uno','Dos','Tres','Cuatro'],correct:2,explanation:'Fixture',reference:'Fixture',difficulty:'media',status:'validada',active:true})
const bank=Array.from({length:9},(_,i)=>Array.from({length:24},(_,j)=>synthetic(i+1,j))).flat()

test('Normalización exacta de tildes, espacios y nombres compuestos',()=>{
  assert.equal(normalize('  ÁNA  MARÍA '),'ana maria')
  assert.notEqual(normalize('Peña'),normalize('Pena'))
  assert.notEqual(normalize('Ana-María'),normalize('Ana María'))
})
test('Pruebas de 20 ítems únicos, equilibradas y con solución tras barajar',()=>{
  for (const topics of [[3],[1,4,7,9],[1,2,3,4,5,6,7,8,9]]) {
    const questions=selectQuestions(bank,topics,new Map())
    assert.equal(new Set(questions.map(q=>q.id)).size,20)
    const quotas=topics.map(topic=>questions.filter(q=>q.topic===topic).length)
    assert.ok(Math.max(...quotas)-Math.min(...quotas)<=1)
    for (const q of questions) assert.equal(q.options[q.correct],'Tres')
  }
  const recent=new Map(bank.filter(q=>q.topic===1).slice(0,4).map(q=>[q.id,3]))
  assert.ok(selectQuestions(bank,[1],recent).every(q=>!recent.has(q.id)))
  assert.equal(selectQuestions(bank.slice(0,19),[1],new Map()),null)
  const depleted=bank.filter(q=>q.topic!==1 || q.id==='1-0')
  assert.equal(selectQuestions(depleted,[1,2],new Map()).filter(q=>q.topic===1).length,1)
})
test('Nota con blancos, penalización, umbral y límites',()=>{
  const items=bank.slice(0,20)
  const answers=(right,wrong)=>Object.fromEntries(Array.from({length:right+wrong},(_,i)=>[i,i<right?2:1]))
  assert.deepEqual(grade(items,answers(11,3)),{right:11,wrong:3,blank:6,grade:5,passed:true})
  assert.equal(grade(items,answers(11,4)).passed,false)
  assert.equal(grade(items,answers(10,1)).grade,4.83)
  assert.equal(grade(items,answers(0,20)).grade,0)
  assert.equal(grade(items,answers(20,0)).grade,10)
})
test('Integración HTTP de sesión, recuperación, corrección, permisos y versiones',async t=>{
  const db=openDatabase(':memory:')
  const code='synthetic-secret-code'
  const hash=hashCode(code)
  const add=db.prepare('INSERT INTO students VALUES (?,?,?,?,?,?)')
  const addStudent=(id,first,last,group)=>add.run(id,first,last,JSON.stringify([normalize(first),normalize(last)]),group,hash)
  addStudent('a','Ána María','Apellido Uno',3)
  addStudent('b','Bea','Apellido Dos',4)
  addStudent('c','Dúo','Igual',3)
  addStudent('d','Duo','Igual',4)
  for (const q of bank) db.prepare('INSERT INTO questions VALUES (?,?,?)').run(q.id,q.version,JSON.stringify(q))
  const origin='https://example.test'
  const server=app({db,teacherHash:hash,origin})
  t.after(()=>{server.close();db.close()})
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  const base='http://127.0.0.1:'+server.address().port+'/api'
  const query=(path,data,cookie,requestOrigin=origin)=>fetch(base+path,data===undefined?{headers:{cookie:cookie??''}}:{
    method:'POST',headers:{cookie:cookie??'',origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(data)
  })
  const login=async(path,data)=>{
    const r=await query(path,data)
    assert.equal(r.status,200)
    const cookie=r.headers.get('set-cookie')
    assert.match(cookie,/HttpOnly; SameSite=Lax.*Secure/)
    return cookie.split(';')[0]
  }
  assert.equal((await query('/me')).status,401)
  assert.equal((await query('/login',{first:'Dúo',last:'Igual',code})).status,401)
  assert.equal((await query('/login',{first:'Nombre',last:'Inexistente',code})).status,401)
  assert.equal((await query('/login',{first:'ANA MARIA',last:'Apellido Uno',code},null,'https://other.test')).status,403)
  const a=await login('/login',{first:' ANA   MARIA ',last:'APELLIDO UNO',code})
  const b=await login('/login',{first:'Bea',last:'Apellido Dos',code})
  const teacher=await login('/teacher/login',{code})
  assert.equal((await (await query('/me',undefined,a)).json()).student.group_no,3)
  assert.equal((await (await query('/me',undefined,b)).json()).student.group_no,4)
  assert.equal((await query('/teacher/bank',undefined,a)).status,403)
  assert.equal((await query('/exam',{topics:[1]},teacher)).status,403)
  const exam=await (await query('/exam',{topics:[1,4,9]},a)).json()
  assert.equal(exam.items.length,20)
  assert.deepEqual(Object.keys(exam.items[0]),['prompt','options'])
  assert.equal((await query('/exam/'+exam.id+'/review',undefined,a)).status,409)
  assert.equal((await query('/exam/'+exam.id+'/answer',{index:0,choice:0},b)).status,404)
  assert.equal((await query('/exam/'+exam.id+'/answer',{index:0,choice:0},a)).status,200)
  const resumed=await (await query('/exam',undefined,a)).json()
  assert.equal(resumed.id,exam.id)
  assert.equal(resumed.answers[0],0)
  const target=bank.find(q=>q.prompt===exam.items[0].prompt)
  assert.equal((await query('/teacher/bank',{...target,correct:1},teacher)).status,200)
  assert.equal((await query('/teacher/bank',{...target,correct:1},teacher)).status,409)
  const finished=await (await query('/exam/'+exam.id+'/finish',{},a)).json()
  assert.equal(finished.blank,19)
  assert.deepEqual(await (await query('/exam/'+exam.id+'/finish',{},a)).json(),finished)
  assert.equal((await query('/exam/'+exam.id+'/review',undefined,b)).status,404)
  const reviewed=await (await query('/exam/'+exam.id+'/review',undefined,a)).json()
  assert.equal(reviewed.items[0].version,1)
  assert.equal(reviewed.items[0].options[reviewed.items[0].correct],'Tres')
  assert.equal((await (await query('/history',undefined,b)).json()).results.length,0)
  const records=await (await query('/teacher/results?group=3&topic=4',undefined,teacher)).json()
  assert.equal(records.results.length,1)
  assert.equal(records.groups[0].students,1)
  assert.match((await query('/teacher/results?format=csv',undefined,teacher)).headers.get('content-type'),/text\/csv/)
})
