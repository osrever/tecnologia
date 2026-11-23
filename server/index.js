import {createServer} from 'node:http'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {resolve, extname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {openDatabase, TEST_STUDENT_ID} from './db.js'
import {normalize, selectQuestions, grade, validQuestion} from './exam.js'
import {token, digest, matches} from './auth.js'

const decode = JSON.parse
const encode = JSON.stringify
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}
const invalid = (status,message) => Object.assign(new Error(message),{status})
const SESSION = 12 * 3600_000

async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw invalid(415,'Formato incorrecto.')
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 32_768) throw invalid(413,'Solicitud demasiado grande.')
    chunks.push(chunk)
  }
  try {
    const value = decode(Buffer.concat(chunks))
    if (!value || Array.isArray(value) || typeof value !== 'object') throw Error()
    return value
  } catch {throw invalid(400,'Solicitud incorrecta.')}
}

const summary = row => ({id:row.id, topics:decode(row.topics), finished:row.finished,
  duration:Math.round((row.finished-row.started)/1000), ...decode(row.result)})
const examView = row => ({id:row.id, topics:decode(row.topics), answers:decode(row.answers),
  items:decode(row.items).map(({prompt,options})=>({prompt,options}))})
const reviewView = row => ({...summary(row), answers:decode(row.answers), items:decode(row.items)})
const csvCell = value => {
  const str = String(value ?? '')
  return '"' + (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(str) ? "'" + str : str).replaceAll('"','""') + '"'
}

export function app({db=openDatabase(), teacherHash=process.env.TEACHER_HASH, origin=process.env.APP_ORIGIN ?? 'http://localhost:3000', secure=origin.startsWith('https:')} = {}) {
  const run = (sql,...args) => db.prepare(sql).run(...args)
  const get = (sql,...args) => db.prepare(sql).get(...args)
  const all = (sql,...args) => db.prepare(sql).all(...args)
  const cookie = (value,age) => `tic=${value}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${age}${secure?'; Secure':''}`
  const questionBank = () => all('SELECT * FROM questions').map(row=>({...decode(row.data),id:row.id,version:row.version}))
  const roster = () => all('SELECT id,first,last,group_no FROM students WHERE id<>? ORDER BY last,first',TEST_STUDENT_ID)
  let teacherFailures = 0
  let teacherWindow = 0
  const flattened = key => decode(key).join(' ')
  const noMatch = 'No encontramos tu nombre en el listado de estudiantes. Comprueba que lo has escrito correctamente'
  function findStudent(value) {
    if (typeof value !== 'string' || value.length > 300) throw invalid(401,noMatch)
    const parts = value.split(',').map(normalize)
    if (parts.length > 2 || parts.some(part=>!part)) throw invalid(401,noMatch)
    const matchesName = key => parts.length===2
      ? key===encode([parts[1],parts[0]])
      : flattened(key)===parts[0]
    const people = all('SELECT id,name_key FROM students').filter(person=>matchesName(person.name_key))
    if (people.length!==1 || all('SELECT name_key FROM ambiguous_names').some(row=>matchesName(row.name_key))) {
      throw invalid(401,noMatch)
    }
    return people[0].id
  }

  return createServer(async (req,res)=>{
    const url = new URL(req.url,'http://localhost')
    const path = url.pathname
    const method = req.method
    res.setHeader('X-Content-Type-Options','nosniff')
    res.setHeader('Referrer-Policy','no-referrer')
    res.setHeader('X-Frame-Options','DENY')
    if (!path.startsWith('/api/')) {
      const dir = resolve('dist')
      const file = resolve(dir,'.'+(path==='/' ? '/index.html' : path))
      if ((method==='GET' || method==='HEAD') && file.startsWith(dir+'/') && MIME[extname(file)]) {
        try {
          const contents = await readFile(file)
          res.writeHead(200,{'Content-Type':MIME[extname(file)]})
          return res.end(method==='HEAD' ? undefined : contents)
        } catch {}
      }
      res.writeHead(404)
      return res.end('No encontrado')
    }

    res.setHeader('Cache-Control','no-store')
    res.setHeader('Content-Type','application/json; charset=utf-8')
    const send = value => res.end(encode(value))
    try {
      if (method !== 'GET' && req.headers.origin !== origin &&
          !(process.env.NODE_ENV !== 'production' && req.headers.origin === 'http://localhost:5173' && !secure)) {
        throw invalid(403,'Origen no autorizado.')
      }
      const now = Date.now()
      const sessionToken = /(?:^|;\s*)tic=([\w-]{32})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1]
      const session = sessionToken && get('SELECT * FROM sessions WHERE token=? AND expires>?',digest(sessionToken),now)
      if (path === '/api/logout' && method === 'POST') {
        if (sessionToken) run('DELETE FROM sessions WHERE token=?',digest(sessionToken))
        res.setHeader('Set-Cookie',cookie('',0))
        return send({})
      }
      if (['/api/login','/api/teacher/login'].includes(path) && method === 'POST') {
        const input = await body(req)
        const role = path.includes('/teacher/') ? 'teacher' : 'student'
        const studentId = role==='student' ? findStudent(input.name) : null
        if (role==='teacher') {
          if (now>=teacherWindow) {
            teacherWindow = now+600_000
            teacherFailures = 0
          }
          if (teacherFailures>=12) throw invalid(429,'Demasiados intentos. Vuelve a intentarlo en unos minutos.')
          const code = typeof input.code==='string' ? input.code.trim() : ''
          if (code.length<16 || code.length>160 || !matches(code,teacherHash)) {
            teacherFailures++
            throw invalid(401,'No se ha podido verificar el acceso.')
          }
          teacherFailures = 0
        }
        const sessionValue = token()
        db.exec('BEGIN IMMEDIATE')
        try {
          run('DELETE FROM sessions WHERE expires<=?',now)
          if (sessionToken) run('DELETE FROM sessions WHERE token=?',digest(sessionToken))
          run('INSERT INTO sessions VALUES (?,?,?,?)',digest(sessionValue),studentId,role,now+SESSION)
          if (studentId) run('INSERT INTO student_access (student,started) VALUES (?,?)',studentId,now)
          db.exec('COMMIT')
        } catch(error) {
          db.exec('ROLLBACK')
          throw error
        }
        res.setHeader('Set-Cookie',cookie(sessionValue,SESSION/1000))
        return send({})
      }

      if (!session) throw invalid(401,'Accede para continuar.')
      const student = session.student && get('SELECT first,last,group_no FROM students WHERE id=?',session.student)
      const topics = () => all('SELECT * FROM topics ORDER BY id')
      if (path === '/api/me' && method === 'GET') return send({role:session.role,student,topics:topics()})

      if (path.startsWith('/api/teacher/')) {
        if (session.role !== 'teacher') throw invalid(403,'Acceso reservado al profesorado.')
        if (path === '/api/teacher/bank' && method === 'GET') return send(questionBank())
        if (path === '/api/teacher/bank/delete' && method === 'POST') {
          const {id,version} = await body(req)
          if (typeof id!=='string' || !Number.isInteger(version)) throw invalid(400,'Solicitud incorrecta.')
          if (!run('DELETE FROM questions WHERE id=? AND version=?',id,version).changes) {
            throw invalid(409,'La pregunta ha cambiado. Recarga el banco.')
          }
          return send({})
        }
        if (path === '/api/teacher/bank' && method === 'POST') {
          const input = await body(req)
          if (!validQuestion(input)) throw invalid(400,'Revisa los campos y el estado de validación.')
          const {topic,concept,prompt,options,correct,explanation,reference,difficulty,status,active} = input
          const data = encode({topic,concept,prompt,options,correct,explanation,reference,difficulty,status,active})
          const id = input.id || randomUUID()
          if (input.id) {
            if (typeof id!=='string' || !Number.isInteger(input.version)) throw invalid(400,'Versión incorrecta.')
            if (!run('UPDATE questions SET data=?,version=version+1 WHERE id=? AND version=?',data,id,input.version).changes) {
              throw invalid(409,'La pregunta ha cambiado. Recarga el banco.')
            }
          } else run('INSERT INTO questions VALUES (?,1,?)',id,data)
          return send({id})
        }
        if (path === '/api/teacher/results' && method === 'GET') {
          const group = url.searchParams.get('group')
          const topic = Number(url.searchParams.get('topic'))
          const start = Number(url.searchParams.get('start')) || 0
          const end = Number(url.searchParams.get('end')) || Number.MAX_SAFE_INTEGER
          const person = url.searchParams.get('student')
          const students = roster()
          const byId = new Map(students.map(s=>[s.id,s]))
          const includesStudent = id => byId.has(id) && (!person || id===person) && (!group || String(byId.get(id).group_no)===group)
          const attempts = all('SELECT student,started,topics FROM attempts WHERE started>=? AND started<?',start,end)
            .filter(row=>includesStudent(row.student) && (!topic || decode(row.topics).includes(topic)))
          const rows = all('SELECT * FROM attempts WHERE finished>=? AND finished<? ORDER BY finished DESC',start,end)
            .filter(row=>includesStudent(row.student) && (!topic || decode(row.topics).includes(topic)))
          const events = all('SELECT student,started FROM student_access WHERE started>=? AND started<? ORDER BY started',start,end)
            .filter(row=>includesStudent(row.student))
          const participantIds = new Set(events.map(row=>row.student))
          // Sessions predating the access log can be inferred from attempts.
          for (const row of [...attempts,...rows]) participantIds.add(row.student)
          const results = rows.map(row=>({...summary(row), student:byId.get(row.student)}))
          if (url.searchParams.get('format')==='csv') {
            res.setHeader('Content-Type','text/csv; charset=utf-8')
            res.setHeader('Content-Disposition','attachment; filename="resultados.csv"')
            return res.end('\uFEFF'+[['Nombre','Apellidos','Grupo','Fecha','Temas','Nota','Aciertos','Fallos','En blanco'],
              ...results.map(r=>[r.student.first,r.student.last,r.student.group_no,new Date(r.finished).toISOString(),r.topics.join(' '),r.grade,r.right,r.wrong,r.blank])]
              .map(row=>row.map(csvCell).join(';')).join('\r\n'))
          }
          const questions = new Map()
          const concepts = new Map()
          const practice = Object.fromEntries(topics().map(({id})=>[id,{selected:0,answered:0,right:0,wrong:0}]))
          for (const row of attempts) {
            for (const id of decode(row.topics)) practice[id].selected++
          }
          for (const row of rows) {
            const answers = decode(row.answers)
            decode(row.items).forEach((q,i)=>{
              if (topic && q.topic!==topic) return
              if (answers[i]!=null) {
                const stats = practice[q.topic]
                stats.answered++
                if (answers[i]===q.correct) stats.right++
                else stats.wrong++
              }
              for (const [map,key,label] of [[questions,q.id+':'+q.version,q.prompt],[concepts,q.topic+':'+q.concept,q.concept]]) {
                const data = map.get(key) ?? {label,topic:q.topic,total:0,wrong:0,blank:0}
                data.total++
                if (answers[i]==null) data.blank++
                else if (answers[i]!==q.correct) data.wrong++
                map.set(key,data)
              }
            })
          }
          const rank = map => {
            const rate = q => q.wrong/(q.total-q.blank || 1)
            return [...map.values()].filter(q=>q.wrong>0).sort((a,b)=>rate(b)-rate(a) || b.wrong-a.wrong).slice(0,10)
          }
          const groups = [3,4].map(group=>{
            const exams = results.filter(r=>r.student.group_no===group)
            const groupStudents = students.filter(s=>s.group_no===group && includesStudent(s.id))
            const scores = new Map()
            for (const r of exams) {
              const s=scores.get(r.student.id) ?? {total:0,count:0}
              s.total+=r.grade
              s.count++
              scores.set(r.student.id,s)
            }
            return {group,attempts:exams.length,enrolled:groupStudents.length,
              students:groupStudents.filter(s=>participantIds.has(s.id)).length,
              average:exams.length ? exams.reduce((sum,r)=>sum+r.grade,0)/exams.length : null,
              studentAverage:scores.size ? [...scores.values()].reduce((sum,s)=>sum+s.total/s.count,0)/scores.size : null}
          })
          const madridDay = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'})
          const byDay = new Map()
          for (const event of events) {
            const day = madridDay.format(event.started)
            if (!byDay.has(day)) byDay.set(day,new Set())
            byDay.get(day).add(event.student)
          }
          const daily = [...byDay].map(([day,ids])=>({day,students:ids.size}))
          const individual = person && byId.has(person) ? {
            ...byId.get(person),
            ...get('SELECT min(started) firstAccess,max(started) lastAccess,count(*) sessions FROM student_access WHERE student=?',person),
            started:get('SELECT count(*) total FROM attempts WHERE student=?',person).total,
            results:all('SELECT * FROM attempts WHERE student=? AND finished IS NOT NULL ORDER BY finished DESC',person).map(summary)
          } : null
          return send({students,results,practice,groups,daily,individual,started:attempts.length,
            questions:rank(questions),concepts:rank(concepts)})
        }
        throw invalid(404,'Operación no disponible.')
      }

      if (session.role !== 'student') throw invalid(403,'Acceso reservado al alumnado.')
      if (path === '/api/exam' && method === 'GET') {
        const row = get('SELECT * FROM attempts WHERE student=? AND finished IS NULL',session.student)
        return send(row ? examView(row) : null)
      }
      if (path === '/api/exam' && method === 'POST') {
        const input = await body(req)
        const ids = input.topics
        if (!Array.isArray(ids) || !ids.length || ids.length>9 || new Set(ids).size!==ids.length ||
          ids.some(id=>!Number.isInteger(id)||id<1||id>9)) throw invalid(400,'Selecciona al menos un tema.')
        const current = get('SELECT * FROM attempts WHERE student=? AND finished IS NULL',session.student)
        if (current) return send(examView(current))
        const recent = new Map()
        all('SELECT items FROM attempts WHERE student=? AND finished IS NOT NULL ORDER BY finished DESC LIMIT 3',session.student)
          .forEach((row,i)=>decode(row.items).forEach(q=>{if(!recent.has(q.id)) recent.set(q.id,3-i)}))
        const items = selectQuestions(questionBank().filter(q=>q.active&&q.status==='validada'),ids,recent)
        if (!items) throw invalid(409,'Estos temas aún no reúnen 20 preguntas validadas. Prueba otra combinación.')
        run('INSERT OR IGNORE INTO attempts (id,student,started,topics,items) VALUES (?,?,?,?,?)',
          randomUUID(),session.student,now,encode(ids),encode(items))
        return send(examView(get('SELECT * FROM attempts WHERE student=? AND finished IS NULL',session.student)))
      }
      if (path === '/api/history' && method === 'GET') {
        const rows = all('SELECT * FROM attempts WHERE student=? AND finished IS NOT NULL ORDER BY finished DESC',session.student)
        const stats = {}
        for (const row of rows) {
          const answers = decode(row.answers)
          decode(row.items).forEach((q,i)=>{
            const entry=stats[q.topic]??={total:0,right:0}
            entry.total++
            if (answers[i]===q.correct) entry.right++
          })
        }
        return send({results:rows.map(summary),stats})
      }
      const match = /^\/api\/exam\/([a-f0-9-]+)\/(answer|finish|review)$/.exec(path)
      if (match) {
        const [,id,action] = match
        const input = method==='POST' ? await body(req) : {}
        const row = get('SELECT * FROM attempts WHERE id=? AND student=?',id,session.student)
        if (!row) throw invalid(404,'Examen no encontrado.')
        if (action==='review' && method==='GET' && row.finished) return send(reviewView(row))
        if (action==='answer' && method==='POST' && !row.finished) {
          const {index,choice} = input
          if (!Number.isInteger(index) || index<0 || index>=20 || ![null,0,1,2,3].includes(choice)) throw invalid(400,'Respuesta incorrecta.')
          const changed = run("UPDATE attempts SET answers=json_set(answers,?,json(?)) WHERE id=? AND finished IS NULL",
            '$."'+index+'"',encode(choice),id)
          if (!changed.changes) throw invalid(409,'El examen ya está corregido.')
          return send({})
        }
        if (action==='finish' && method==='POST') {
          if (!row.finished) run('UPDATE attempts SET finished=?,result=? WHERE id=? AND finished IS NULL',
            now,encode(grade(decode(row.items),decode(row.answers))),id)
          return send(summary(get('SELECT * FROM attempts WHERE id=?',id)))
        }
        throw invalid(409,'La operación no está disponible en este estado.')
      }
      throw invalid(404,'Operación no disponible.')
    } catch (error) {
      res.statusCode = error.status ?? 500
      if (!error.status) console.error(error.code ?? error.name)
      send({error:error.status ? error.message : 'Error del servicio.'})
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000)
  if (process.env.NODE_ENV==='production' && !/^https:\/\/[^/]+$/.test(process.env.APP_ORIGIN ?? '')) {
    throw new Error('Configura APP_ORIGIN con el origen HTTPS del servicio.')
  }
  app().listen(port,process.env.BIND ?? '127.0.0.1',()=>console.log('Servidor disponible en el puerto '+port))
}
