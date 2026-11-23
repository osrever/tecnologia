import {readFileSync, writeFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {openDatabase} from './db.js'
import {normalize, validQuestion} from './exam.js'
import {token, hashCode} from './auth.js'

const [command, source] = process.argv.slice(2)
if (command==='teacher') {
  const code = token()
  writeFileSync(source,JSON.stringify({code,hash:hashCode(code)},null,2),{mode:0o600,flag:'wx'})
  console.log('Credencial de administración creada en el archivo indicado.')
} else {
  const db = openDatabase()
  const read = path => JSON.parse(readFileSync(path,'utf8'))
  const transaction = action => {
    db.exec('BEGIN IMMEDIATE')
    try {action();db.exec('COMMIT')}
    catch(error) {db.exec('ROLLBACK');throw error}
  }
  if (command==='students') {
    const students = read(source)
    if (!Array.isArray(students) || !students.length || students.some(s=>!normalize(s.first) || !normalize(s.last) || ![3,4].includes(s.group))) {
      throw Error('Listado inválido.')
    }
    const key = s => JSON.stringify([normalize(s.first),normalize(s.last)])
    const counts = new Map()
    for (const s of students) counts.set(key(s),(counts.get(key(s))??0)+1)
    let created = 0
    const rejected = []
    transaction(()=>{
      const existing = db.prepare('SELECT 1 FROM students WHERE name_key=?')
      const add = db.prepare('INSERT INTO students VALUES (?,?,?,?,?)')
      const suspend = db.prepare('INSERT OR IGNORE INTO ambiguous_names VALUES (?)')
      const revoke = db.prepare('DELETE FROM sessions WHERE student IN (SELECT id FROM students WHERE name_key=?)')
      const unblock = db.prepare('DELETE FROM ambiguous_names WHERE name_key=?')
      for (const s of students) {
        const name = key(s)
        if (counts.get(name)!==1) {
          suspend.run(name)
          revoke.run(name)
          rejected.push(s)
          continue
        }
        unblock.run(name)
        if (existing.get(name)) continue
        add.run(randomUUID(),s.first.trim(),s.last.trim(),name,s.group)
        created++
      }
    })
    console.log(`Altas: ${created}. Filas ambiguas: ${rejected.length}.`)
  } else if (command==='bank') {
    const {topics,questions} = read(source)
    if (topics.length!==9 || new Set(topics.map(t=>t.id)).size!==9 ||
      topics.some(t=>!Number.isInteger(t.id)||t.id<1||t.id>9||typeof t.title!=='string'||!t.title.trim()) ||
      !questions.every(q=>validQuestion(q)&&typeof q.id==='string'&&q.id.trim()) ||
      new Set(questions.map(q=>q.id)).size!==questions.length) throw Error('Banco inválido.')
    transaction(()=>{
      const setTitle=db.prepare('UPDATE topics SET title=? WHERE id=?')
      for (const t of topics) setTitle.run(t.title,t.id)
      const put=db.prepare('INSERT INTO questions VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET version=version+1,data=excluded.data WHERE data<>excluded.data')
      for (const {id,topic,concept,prompt,options,correct,explanation,reference,difficulty,status,active} of questions) {
        put.run(id,JSON.stringify({topic,concept,prompt,options,correct,explanation,reference,difficulty,status,active}))
      }
    })
    console.log(`Preguntas importadas: ${questions.length}.`)
  } else if (command==='delete-student') {
    const deleted = db.prepare('DELETE FROM students WHERE id=?').run(source)
    if (!deleted.changes) throw Error('No se encontró ese identificador.')
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    console.log('Ficha, accesos, sesiones e intentos eliminados.')
  } else throw Error('Comandos: teacher, students, bank, delete-student.')
  db.close()
}
