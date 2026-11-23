const demoId = 'test-paco-olivares'
const demo = {id:demoId,first:'Paco',last:'Olivares',group_no:3}
const sessionDuration = 12*60*60*1000
const sheets = ['Students','Topics','Questions','Sessions','Attempts','Access']

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('Autoevaluación TIC Escrita')
    .addMetaTag('viewport','width=device-width, initial-scale=1')
}

function props_() {
  return PropertiesService.getScriptProperties()
}

function fail_(message) {
  throw Object.assign(new Error(message),{publicMessage:message})
}

function token_() {
  return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'')
}

function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8)
    .map(byte=>(byte&255).toString(16).padStart(2,'0')).join('')
}

function same_(a,b) {
  if (!b || a.length!==b.length) return false
  let difference=0
  for (let i=0;i<a.length;i++) difference|=a.charCodeAt(i)^b.charCodeAt(i)
  return difference===0
}

function lock_(callback) {
  const lock=LockService.getScriptLock()
  if (!lock.tryLock(8000)) fail_('Hay varias operaciones en curso. Vuelve a intentarlo.')
  try {return callback()} finally {
    try {SpreadsheetApp.flush()} finally {lock.releaseLock()}
  }
}

function store_() {
  const id=props_().getProperty('DATABASE_ID')
  if (!id) fail_('La aplicación todavía se está configurando.')
  const database=SpreadsheetApp.openById(id)
  return {
    all(name) {
      const sheet=database.getSheetByName(name)
      return sheet.getDataRange().getValues().flat().map((text,index)=>({text,row:index+1}))
        .filter(record=>record.text).map(({text,row})=>({row,...JSON.parse(text)}))
    },
    save(name,value,row) {
      const sheet=database.getSheetByName(name)
      const text=JSON.stringify(value)
      if (text.length>49000) fail_('El registro supera el tamaño permitido.')
      if (row) sheet.getRange(row,1).setValue(text)
      else sheet.appendRow([text])
    },
    append(name,records) {
      if (!records.length) return
      const sheet=database.getSheetByName(name)
      const values=records.map(record=>[JSON.stringify(record)])
      sheet.getRange(sheet.getLastRow()+1,1,values.length,1).setValues(values)
    },
    remove(name,row) {
      database.getSheetByName(name).getRange(row,1).clearContent()
    }
  }
}

function setupPrivate_() {
  const properties=props_()
  if (!properties.getProperty('DATABASE_ID')) {
    const database=SpreadsheetApp.create('Autoevaluación TIC · datos privados')
    database.getSheets()[0].setName(sheets[0])
    for (const name of sheets.slice(1)) database.insertSheet(name)
    properties.setProperty('DATABASE_ID',database.getId())
    const store=store_()
    store.save('Students',demo)
  }
}

function importBank_() {
  const fileId=props_().getProperty('BANK_FILE_ID')
  if (!fileId) throw Error('Configura BANK_FILE_ID.')
  const data=JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8'))
  if (!Array.isArray(data.topics)||!Array.isArray(data.questions)||!data.questions.every(validQuestion)) throw Error('Banco inválido.')
  lock_(()=>{
    const store=store_()
    const topics=new Map(store.all('Topics').map(topic=>[topic.id,topic]))
    for (const {id,title} of data.topics) store.save('Topics',{id,title},topics.get(id)?.row)
    const questions=new Set(store.all('Questions').map(question=>question.id))
    store.append('Questions',data.questions.filter(question=>!questions.has(question.id))
      .map(question=>({...question,version:1})))
  })
}

function importStudents_() {
  const props=props_()
  const people=[]
  for (const group of [3,4]) {
    const id=props.getProperty('GROUP_'+group+'_SHEET_ID')
    if (!id) throw Error('Configura los identificadores de los grupos.')
    const sheet=SpreadsheetApp.openById(id).getSheetByName('Lista de clase')
    if (sheet.getLastRow()<7) continue
    for (const [value] of sheet.getRange(7,1,sheet.getLastRow()-6,1).getDisplayValues()) {
      if (!/^[^,]+,[^,]+$/.test(value)) continue
      const [last,first]=value.split(',').map(part=>part.trim())
      if (first&&last) people.push({first,last,group_no:group})
    }
  }
  lock_(()=>{
    const store=store_()
    const current=store.all('Students').filter(p=>p.id!==demoId)
    const keys=new Map()
    for (const p of people) {
      const key=nameKey_(p)
      if (!keys.has(key)) keys.set(key,[])
      keys.get(key).push(p)
    }
    for (const p of current) {
      const matches=keys.get(nameKey_(p))
      const active=matches?.length===1
      store.save('Students',{id:p.id,first:p.first,last:p.last,group_no:active?matches[0].group_no:p.group_no,active},p.row)
      if (active) keys.delete(nameKey_(p))
    }
    for (const matches of keys.values()) {
      if (matches.length===1) store.save('Students',{id:token_(),...matches[0],active:true})
    }
  })
}

function nameKey_(student) {
  return JSON.stringify([normalize(student.first),normalize(student.last)])
}

function identify_(students,value) {
  const parts=typeof value==='string'&&value.length<=300 ? value.split(',').map(normalize) : []
  const matches=students.filter(s=>s.active!==false && (parts.length===1 && parts[0]===normalize(s.first+' '+s.last) ||
    parts.length===2 && nameKey_(s)===JSON.stringify([parts[1],parts[0]])))
  if (matches.length!==1) fail_('No encontramos tu nombre en el listado de estudiantes. Comprueba que lo has escrito correctamente')
  return matches[0]
}

function summary_(exam) {
  return {id:exam.id,topics:exam.topics,finished:exam.finished,duration:Math.round((exam.finished-exam.started)/1000),...exam.result}
}

function examView_(exam) {
  return {id:exam.id,topics:exam.topics,answers:exam.answers,items:exam.items.map(({prompt,options})=>({prompt,options}))}
}

function request(path,input,token) {
  try {
    if (typeof path!=='string'||path.length>1500 || JSON.stringify(input??null).length>32768) fail_('Solicitud incorrecta.')
    if (input!==null && (typeof input!=='object'||Array.isArray(input))) fail_('Solicitud incorrecta.')
    const value=lock_(()=>route_(store_(),path,input,token))
    return value?.loginToken ? {token:value.loginToken,value:{}} : {value}
  } catch(error) {
    if (!error.publicMessage) console.error('Error interno en la aplicación.')
    return {error:error.publicMessage||'Error del servicio.'}
  }
}

function route_(store,path,input,token) {
  const [route,query='']=path.split('?')
  const params=Object.fromEntries(query.split('&').map(segment=>segment.split('=')))
  const now=Date.now()
  const sessions=store.all('Sessions')
  const sessionId=typeof token==='string' && /^[a-f0-9]{64}$/.test(token)?hash_(token):null
  const session=sessionId?sessions.find(s=>s.id===sessionId&&s.expires>now):null
  if (route==='/logout' && input) {
    if (session) store.remove('Sessions',session.row)
    return {}
  }
  const students=()=>store.all('Students')
  if ((route==='/login'||route==='/teacher/login') && input) {
    const teacher=route==='/teacher/login'
    const student=teacher?null:identify_(students(),input.name)
    if (teacher) {
      const props=props_()
      const limit=JSON.parse(props.getProperty('TEACHER_FAILURES')||'null')
      if (limit?.until>now&&limit.count>=12) fail_('Demasiados intentos. Vuelve a intentarlo en unos minutos.')
      const code=typeof input.code==='string'?input.code.trim():''
      if (code.length<32 || code.length>160 || !same_(hash_(code),props.getProperty('TEACHER_HASH'))) {
        props.setProperty('TEACHER_FAILURES',JSON.stringify(limit?.until>now?{...limit,count:limit.count+1}:{count:1,until:now+600000}))
        fail_('No se ha podido verificar el acceso.')
      }
      props.deleteProperty('TEACHER_FAILURES')
    }
    const loginToken=token_()
    const slot=session||sessions.find(s=>s.expires<=now)
    store.save('Sessions',{id:hash_(loginToken),student:student?.id??null,role:teacher?'teacher':'student',expires:now+sessionDuration},slot?.row)
    if (student) store.save('Access',{student:student.id,started:now})
    return {loginToken}
  }

  if (!session) fail_('Accede para continuar.')
  const student=session.student?students().find(s=>s.id===session.student&&s.active!==false):null
  if (session.role==='student'&&!student) fail_('Accede para continuar.')
  const topics=()=>store.all('Topics').map(({id,title})=>({id,title})).sort((a,b)=>a.id-b.id)
  if (route==='/me'&&!input) return {role:session.role,student:student?{first:student.first,last:student.last,group_no:student.group_no}:null,topics:topics()}
  if (route.startsWith('/teacher/')) {
    if (session.role!=='teacher') fail_('Acceso reservado al profesorado.')
    return teacherRoute_(store,route,input,params)
  }
  if (!student) fail_('Acceso reservado al alumnado.')
  const attempts=store.all('Attempts').filter(exam=>exam.student===student.id)
  if (route==='/history'&&!input) {
    const complete=attempts.filter(exam=>exam.finished).sort((a,b)=>b.finished-a.finished)
    const stats={}
    for (const exam of complete) exam.items.forEach((q,index)=>{
      const topic=stats[q.topic]??={total:0,right:0}
      topic.total++
      if (exam.answers[index]===q.correct) topic.right++
    })
    return {results:complete.map(summary_),stats}
  }
  if (route==='/exam') {
    const active=attempts.find(exam=>!exam.finished)
    if (!input) return active?examView_(active):null
    const requested=input.topics
    if (!Array.isArray(requested)||!requested.length||requested.length>9||new Set(requested).size!==requested.length||
      requested.some(id=>!Number.isInteger(id)||id<1||id>9)) fail_('Selecciona al menos un tema.')
    if (active) return examView_(active)
    const recent=new Map()
    attempts.filter(exam=>exam.finished).sort((a,b)=>b.finished-a.finished).slice(0,3)
      .forEach((exam,i)=>exam.items.forEach(q=>{if (!recent.has(q.id)) recent.set(q.id,3-i)}))
    const items=selectQuestions(store.all('Questions').filter(q=>q.active&&q.status==='validada').map(({row,...q})=>q),requested,recent)
    if (!items) fail_('Estos temas aún no reúnen 20 preguntas validadas. Prueba otra combinación.')
    const exam={id:token_(),student:student.id,topics:requested,items,answers:{},started:now}
    store.save('Attempts',exam)
    return examView_(exam)
  }
  const match=/^\/exam\/([a-f0-9]+)\/(answer|finish|review)$/.exec(route)
  if (match) {
    const exam=attempts.find(item=>item.id===match[1])
    if (!exam) fail_('Examen no encontrado.')
    const action=match[2]
    if (action==='review'&&!input&&exam.finished) return {...summary_(exam),answers:exam.answers,items:exam.items}
    if (action==='answer'&&input&&!exam.finished) {
      const {index,choice}=input
      if (!Number.isInteger(index)||index<0||index>=20||![null,0,1,2,3].includes(choice)) fail_('Respuesta incorrecta.')
      exam.answers[index]=choice
      store.save('Attempts',exam,exam.row)
      return {}
    }
    if (action==='finish'&&input) {
      if (!exam.finished) {
        exam.finished=now
        exam.result=grade(exam.items,exam.answers)
        store.save('Attempts',exam,exam.row)
      }
      return summary_(exam)
    }
  }
  fail_('Operación no disponible.')
}

function csvCell_(value) {
  const text=String(value??'')
  return '"'+(/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)?"'"+text:text).replaceAll('"','""')+'"'
}

function teacherRoute_(store,route,input,params) {
  if (route==='/teacher/bank' && !input) return store.all('Questions').map(({row,...q})=>q)
  if ((route==='/teacher/bank'||route==='/teacher/bank/delete') && input) {
    const existing=input.id?store.all('Questions').find(q=>q.id===input.id):null
    if (input.id && (!existing||existing.version!==input.version)) fail_('La pregunta ha cambiado. Recarga el banco.')
    if (route.endsWith('/delete')) {
      if (!existing) fail_('Solicitud incorrecta.')
      store.remove('Questions',existing.row)
      return {}
    }
    if (!validQuestion(input)) fail_('Revisa los campos y el estado de validación.')
    const {topic,concept,prompt,options,correct,explanation,reference,difficulty,status,active}=input
    const id=existing?.id??token_()
    store.save('Questions',{id,version:(existing?.version??0)+1,topic,concept,prompt,options,correct,explanation,reference,difficulty,status,active},existing?.row)
    return {id}
  }

  if (route!=='/teacher/results'||input) fail_('Operación no disponible.')
  const topic=Number(params.topic)||0
  const start=Number(params.start)||0
  const end=Number(params.end)||Number.MAX_SAFE_INTEGER
  const students=store.all('Students').filter(s=>s.id!==demoId).map(({id,first,last,group_no,active})=>({id,first,last,group_no,active:active!==false}))
  students.sort((a,b)=>a.last.localeCompare(b.last,'es')||a.first.localeCompare(b.first,'es'))
  const byId=new Map(students.map(s=>[s.id,s]))
  const includes=id=>byId.has(id)&&(!params.group||String(byId.get(id).group_no)===params.group)&&(!params.student||id===params.student)
  const inRange=time=>time>=start&&time<end
  const exams=store.all('Attempts').filter(exam=>includes(exam.student))
  const selected=exams.filter(exam=>!topic||exam.topics.includes(topic))
  const started=selected.filter(exam=>inRange(exam.started))
  const finished=selected.filter(exam=>inRange(exam.finished)).sort((a,b)=>b.finished-a.finished)
  const results=finished.map(exam=>({...summary_(exam),student:byId.get(exam.student)}))
  if (params.format==='csv') return '\uFEFF'+[['Nombre','Apellidos','Grupo','Fecha','Temas','Nota','Aciertos','Fallos','En blanco'],
    ...results.map(r=>[r.student.first,r.student.last,r.student.group_no,new Date(r.finished).toISOString(),r.topics.join(' '),r.grade,r.right,r.wrong,r.blank])]
    .map(row=>row.map(csvCell_).join(';')).join('\r\n')

  const events=store.all('Access').filter(event=>includes(event.student))
  const windowEvents=events.filter(event=>inRange(event.started))
  const participantIds=new Set(windowEvents.map(e=>e.student))
  const days=new Map()
  for (const event of windowEvents) {
    const day=Utilities.formatDate(new Date(event.started),'Europe/Madrid','yyyy-MM-dd')
    if (!days.has(day)) days.set(day,new Set())
    days.get(day).add(event.student)
  }
  const daily=[...days].sort(([a],[b])=>a.localeCompare(b)).map(([day,ids])=>({day,students:ids.size}))
  const practice=Object.fromEntries(store.all('Topics').map(({id})=>[id,{selected:0,answered:0,right:0,wrong:0}]))
  for (const exam of started) for (const id of exam.topics) practice[id].selected++
  const questions=new Map()
  const concepts=new Map()
  for (const exam of finished) exam.items.forEach((q,index)=>{
    if (topic&&q.topic!==topic) return
    const answer=exam.answers[index]
    const stats=practice[q.topic]
    if (answer!=null) {
      stats.answered++
      if (answer===q.correct) stats.right++
      else stats.wrong++
    }
    for (const [map,key,label] of [[questions,q.id+':'+q.version,q.prompt],[concepts,q.topic+':'+q.concept,q.concept]]) {
      const metric=map.get(key)??{label,topic:q.topic,total:0,wrong:0,blank:0}
      metric.total++
      if (answer==null) metric.blank++
      else if (answer!==q.correct) metric.wrong++
      map.set(key,metric)
    }
  })
  const rate=q=>q.wrong/(q.total-q.blank)
  const rank=map=>[...map.values()].filter(q=>q.wrong).sort((a,b)=>rate(b)-rate(a)||b.wrong-a.wrong).slice(0,10)
  const average=values=>values.length?values.reduce((total,number)=>total+number,0)/values.length:null
  const groups=[3,4].map(group=>{
    const members=students.filter(s=>s.active&&s.group_no===group&&includes(s.id))
    const groupResults=results.filter(r=>r.student.group_no===group)
    const scores=new Map()
    for (const result of groupResults) {
      if (!scores.has(result.student.id)) scores.set(result.student.id,[])
      scores.get(result.student.id).push(result.grade)
    }
    return {group,enrolled:members.length,students:members.filter(s=>participantIds.has(s.id)).length,
      attempts:groupResults.length,average:average(groupResults.map(r=>r.grade)),studentAverage:average([...scores.values()].map(average))}
  })
  const person=params.student?byId.get(params.student):null
  const individual=person?{
    ...person,
    firstAccess:events.length?Math.min(...events.map(e=>e.started)):null,
    lastAccess:events.length?Math.max(...events.map(e=>e.started)):null,
    sessions:events.length,started:exams.length,
    results:exams.filter(exam=>exam.finished).sort((a,b)=>b.finished-a.finished).map(summary_)
  }:null
  return {students,results,practice,groups,daily,individual,started:started.length,questions:rank(questions),concepts:rank(concepts)}
}
